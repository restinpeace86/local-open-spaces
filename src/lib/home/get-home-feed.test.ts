import { afterEach, describe, expect, it, vi } from 'vitest';

// Task 9-1-3: Haversine 반경 필터링을 걷어내고 sigungu_name 기반 지역 우선 정렬 + 중복 제거로
// 전환한 것을 검증한다. Supabase 쿼리 빌더는 메서드 체이닝 후 마지막에 .limit()이 Promise를
// 반환하는 구조라, 어떤 필터 메서드가 몇 번 호출되든 항상 자기 자신을 반환하는 체이너블
// 스텁으로 모킹한다.
function makeChainable(result: { data: unknown[]; error: null }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.lte = self;
  builder.gte = self;
  builder.gt = self;
  builder.eq = self;
  builder.in = self;
  builder.not = self;
  builder.or = self;
  builder.order = self;
  builder.limit = () => Promise.resolve(result);
  return builder;
}

// Task 9-1-9: getTodayEvents가 부족분을 채울 때 events 테이블을 두 번(당일 조회 → 이번 주
// 마감임박 조회) 조회한다. 호출 순서대로 서로 다른 결과를 돌려주는 스텁이 필요하다.
function makeSequentialFrom(dataSequence: unknown[][]) {
  let callIndex = 0;
  return () => {
    const data = dataSequence[callIndex] ?? [];
    callIndex += 1;
    return makeChainable({ data, error: null });
  };
}

// Task 9-1-4/9-4-4/9-5-1: fetchRegionFirstRows가 실제로 지역/테마 조건을 SQL 단에서 필터링해
// 후보군을 확보하는지(단순히 최신순 500건을 한 번 가져와 뒤섞이는 게 아닌지) 검증하려면,
// .eq()/.or()에 넘어온 조건을 실제로 반영해 데이터를 걸러주는 좀 더 정교한 스텁이 필요하다.
// Task 9-4-4: sigungu_name 정확 일치(.eq) 대신 ILIKE 퍼지 매칭(.or('col.ilike.%token%,...'))을
// 쓰고, Task 9-5-1: 테마 필터에는 `source_type.in.(A,B)` 조건도 함께 온다.
// 실제 PostgREST/supabase-js는 .or()를 여러 번 호출하면 각각 별도의 OR 그룹으로 추가돼
// AND로 결합된다(실측 확인: postgrest-js의 or()는 매번 새 `or=` 쿼리 파라미터를 append함) —
// 이 스텁도 그 동작을 그대로 재현해야 한다(마지막 .or()만 남기면 안 됨 — 예: 테마 필터 뒤에
// 지역 필터가 덧붙는 getThemeSpotFeed에서 앞선 테마 조건이 사라지는 버그가 생김).
function makeFilteringChainable(rows: Array<Record<string, unknown>>) {
  const eqFilters: Record<string, unknown> = {};
  const inFilters: Record<string, unknown[]> = {};
  const notNullFilters: string[] = [];
  const orFilterGroups: string[] = [];
  // [이벤트픽 화면 개편](2026-08-27): getCurrentlyOngoingEvents 등 lte/gte 날짜 범위 필터를
  // 실제로 검증하려면 no-op이던 이 두 메서드가 실제로 걸러줘야 한다. 기존 다른 describe
  // 블록들은 전부 eventRow()의 기본값(start_date=end_date=오늘)만 쓰거나 lte/gte를 쓰지 않는
  // 함수만 테스트해 영향이 없음을 확인했다.
  const lteFilters: Record<string, unknown> = {};
  const gteFilters: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.lte = (column: string, value: unknown) => {
    lteFilters[column] = value;
    return builder;
  };
  builder.gte = (column: string, value: unknown) => {
    gteFilters[column] = value;
    return builder;
  };
  builder.gt = () => builder;
  builder.order = () => builder;
  builder.eq = (column: string, value: unknown) => {
    eqFilters[column] = value;
    return builder;
  };
  builder.in = (column: string, values: unknown[]) => {
    inFilters[column] = values;
    return builder;
  };
  // docs/spec.md 1: getFreeFeed/getCategoryFeed 등에서 쓰는 `.not(col, 'is', null)`(중분류
  // 유효성 조건) 재현 — 이 스텁은 'is'/null 조합만 지원한다(실제 코드가 이 조합으로만 호출함).
  builder.not = (column: string, operator: string, value: unknown) => {
    if (operator === 'is' && value === null) notNullFilters.push(column);
    return builder;
  };
  builder.or = (expr: string) => {
    orFilterGroups.push(expr);
    return builder;
  };
  builder.limit = (n: number) => {
    let filtered = rows;
    if (Object.keys(eqFilters).length > 0) {
      filtered = filtered.filter((row) => Object.entries(eqFilters).every(([col, val]) => row[col] === val));
    }
    if (Object.keys(inFilters).length > 0) {
      filtered = filtered.filter((row) => Object.entries(inFilters).every(([col, vals]) => vals.includes(row[col])));
    }
    if (notNullFilters.length > 0) {
      filtered = filtered.filter((row) => notNullFilters.every((col) => row[col] !== null && row[col] !== undefined));
    }
    if (Object.keys(lteFilters).length > 0) {
      filtered = filtered.filter((row) =>
        Object.entries(lteFilters).every(
          ([col, val]) => row[col] !== null && row[col] !== undefined && String(row[col]) <= String(val)
        )
      );
    }
    if (Object.keys(gteFilters).length > 0) {
      filtered = filtered.filter((row) =>
        Object.entries(gteFilters).every(
          ([col, val]) => row[col] !== null && row[col] !== undefined && String(row[col]) >= String(val)
        )
      );
    }
    for (const group of orFilterGroups) {
      const conditions = group.split(',').map((cond) => {
        const [column, operator, ...rest] = cond.split('.');
        const rawValue = rest.join('.');
        return { column, operator, rawValue };
      });
      filtered = filtered.filter((row) =>
        conditions.some(({ column, operator, rawValue }) => {
          const cell = row[column];
          if (operator === 'in') {
            const values = rawValue.replace(/^\(|\)$/g, '').split(',');
            return typeof cell === 'string' && values.includes(cell);
          }
          if (operator === 'ilike') {
            const needle = rawValue.replace(/^%|%$/g, '');
            return typeof cell === 'string' && cell.includes(needle);
          }
          if (operator === 'eq') {
            if (rawValue === 'true') return cell === true;
            if (rawValue === 'false') return cell === false;
            return String(cell) === rawValue;
          }
          if (operator === 'is') {
            return rawValue === 'null' ? cell === null || cell === undefined : String(cell) === rawValue;
          }
          if (operator === 'gte') {
            return cell !== null && cell !== undefined && String(cell) >= rawValue;
          }
          return false;
        })
      );
    }
    return Promise.resolve({ data: filtered.slice(0, n), error: null });
  };
  return builder;
}

// Task 9-6-9(2026-08-23): getTodayEvents가 이제 end_date를 "오늘" 날짜와 정확히 일치(.eq)하는
// 행만 조회한다(당일 한정 피딩) — makeFilteringChainable은 .eq()를 실제로 강제하므로, 고정된
// 과거 날짜 문자열을 쓰면 테스트를 실행하는 실제 날짜에 따라 우연히 깨진다. 항상 "실행 시점의
// 오늘"을 기본값으로 써서 날짜에 무관하게 안정적으로 통과하게 한다.
const TODAY_STR = new Date().toISOString().slice(0, 10);

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    title: '테스트 행사',
    event_type: 'PERFORMANCE_FESTIVAL',
    location: { coordinates: [127.1287, 37.3809] },
    thumbnail_url: null,
    start_date: TODAY_STR,
    end_date: TODAY_STR,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: false,
    is_free: true,
    is_kids_friendly: false,
    has_parking: false,
    stroller_accessible: false,
    facility_type: '복합',
    target_age_group: null,
    booking_status: '오늘방문',
    venue_name: '율동공원 야외무대',
    sigungu_name: '성남시 분당구',
    // docs/spec.md 1: 이벤트픽 화면 노출 3대 조건(타겟 연령대 5대값 중 하나, 중분류 NOT NULL)을
    // 기본으로 충족하는 값 — 이 조건 자체를 검증하는 테스트만 명시적으로 override한다.
    target_audience: 'FAMILY',
    category_min: '체험',
    ...overrides,
  };
}

describe('getTodayEvents (Task 9-1-3: 거리 계산 없음 / Task 9-1-6: Strict Location-First)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('거리 계산 없이 venue_name/sigungu_name을 그대로 매핑한다(distance_meters는 -1)', async () => {
    const row = eventRow();

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [row], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items[0].address).toBe('율동공원 야외무대');
    expect(items[0].sigungu_name).toBe('성남시 분당구');
    expect(items[0].distance_meters).toBe(-1);
  });

  it('venue_name이 없으면 address도 null이다(가짜 장소명 생성 안 함)', async () => {
    const row = eventRow({ venue_name: null });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [row], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items[0].address).toBeNull();
  });

  it('Task 9-1-6: 선택 지역 데이터가 limit보다 적으면 부족분만 다른 지역으로 채운다', async () => {
    const otherRegion = eventRow({ id: 'other', sigungu_name: '강남구' });
    const selectedRegion = eventRow({ id: 'selected', sigungu_name: '성남시 분당구' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({ from: () => makeChainable({ data: [otherRegion, selectedRegion], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '성남시 분당구' });

    // 선택 지역 1건뿐이라 limit(10)에 못 미치므로, 다른 지역으로 부족분을 채운다.
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('selected');
    expect(items[1].id).toBe('other');
  });

  // Task 9-4-4(2026-08-22) 실측에서 발견한 버그 재현: sigungu_name이 VWorld 백필 전이라
  // NULL이어도(Task 9-2-1/9-3-2에서 API 키 일시 차단으로 미완료된 실제 상황), venue_name
  // 텍스트에 지역명이 들어있으면 정확 일치(.eq) 대신 ILIKE 퍼지 매칭으로 찾아내 0건이 되지
  // 않아야 한다.
  it('Task 9-4-4: sigungu_name이 NULL이어도 venue_name에 지역명이 있으면 ILIKE로 찾아낸다', async () => {
    const backfillPending = eventRow({
      id: 'no-sigungu',
      venue_name: '분당구 율동공원',
      sigungu_name: null,
      is_active: true,
    });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([backfillPending]) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '성남시 분당구' });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('no-sigungu');
  });

  // 긴급 수리(Hotfix, 2026-08-22) 실측 재현: sigunguName에 쉼표가 섞여 있으면(예: Kakao 검색
  // 결과 주소의 건물/층수 부기가 남는 경우) PostgREST `.or()` 필터 문자열이 쉼표 때문에 깨져
  // "failed to parse logic tree" 500 에러가 났고, 그 응답을 그대로 쓰는 클라이언트가 크래시했다.
  // sigunguName 토큰에서 쉼표/괄호를 제거해 필터 문자열이 절대 깨지지 않아야 한다.
  it('Task Hotfix: sigunguName에 쉼표가 섞여 있어도 PostgREST 필터가 깨지지 않고 정상 조회된다', async () => {
    const orCalls: string[] = [];
    const capturingChainable = (result: { data: unknown[]; error: null }) => {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      builder.select = self;
      builder.lte = self;
      builder.gte = self;
      builder.gt = self;
      builder.eq = self;
      builder.in = self;
      builder.not = self;
      builder.or = (expr: string) => {
        orCalls.push(expr);
        return builder;
      };
      builder.order = self;
      builder.limit = () => Promise.resolve(result);
      return builder;
    };

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => capturingChainable({ data: [], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');

    // 쉼표가 섞인 지역명으로 호출해도 예외 없이 resolve돼야 한다(실측 재현 전에는 이 호출
    // 자체가 아니라 실제 PostgREST 서버가 500을 반환했지만, 필터 문자열 생성 단계에서부터
    // 쉼표가 그대로 남으면 안 되므로 여기서는 생성된 .or() 문자열을 직접 검증한다).
    await expect(getTodayEvents(10, { sigunguName: '성남시, 분당구' })).resolves.toEqual([]);

    // 지역 관련 .or() 호출(예약 조건 .or()는 sigungu_name을 포함하지 않으므로 제외) 중 어디에도
    // 토큰 자체에 남은 쉼표(정제 전 원본 조각) 때문에 필터가 깨지는 형태가 없어야 한다.
    // Task 9-6-7: 3순위(도 전체) 조회는 provinceMembers 여러 개를 한 번에 묶은 필터라 정상적으로
    // 조건이 2개보다 많다(토큰 개수 × 2) — "정확히 2개"가 아니라 "항상 짝수(토큰마다 쌍으로
    // 생성됨)"인지, 그리고 정제 안 된 쉼표 조각이 하나도 안 남는지를 검증한다.
    const regionFilters = orCalls.filter((expr) => expr.includes('sigungu_name'));
    expect(regionFilters.length).toBeGreaterThan(0);
    for (const filter of regionFilters) {
      expect(filter.split(',').length % 2).toBe(0);
      // 토큰에서 쉼표가 제거됐는지 직접 확인(정제 전이었다면 "분당구,"가 그대로 남았을 것).
      expect(filter).not.toContain('분당구,');
      expect(filter).not.toContain('성남시,');
    }
  });

  it('Task 9-1-6: Strict Location-First — 선택 지역만으로 limit이 충족되면 다른 지역은 완전히 배제한다', async () => {
    const selectedRegionRows = Array.from({ length: 3 }, (_, i) =>
      eventRow({ id: `selected-${i}`, title: `분당 행사 ${i}`, sigungu_name: '성남시 분당구' })
    );
    const otherRegionRow = eventRow({ id: 'other', sigungu_name: '강남구' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          from: () => makeChainable({ data: [otherRegionRow, ...selectedRegionRows], error: null }),
        }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    // limit을 3으로 두면 선택 지역 3건만으로 충족되므로 강남구 항목은 결과에 전혀 없어야 한다.
    const items = await getTodayEvents(3, { sigunguName: '성남시 분당구' });

    expect(items).toHaveLength(3);
    expect(items.every((item) => item.sigungu_name === '성남시 분당구')).toBe(true);
    expect(items.some((item) => item.id === 'other')).toBe(false);
  });

  // Task 9-4-3(2026-08-22): 1순위(선택 시/군/구)로 limit이 안 채워지면, 아무 지역이나 섞지 않고
  // 같은 상위 시(성남시)의 다른 구를 2순위로 먼저 채운 뒤에야 도내 다른 지역(3순위)을 채운다.
  // Task 9-6-7(2026-08-23): 원래 "완전히 다른 지역" 예시로 강남구(서울)를 썼으나, 이제
  // provinceMembers 자동 판별로 서울은 3순위에서도 완전히 차단되는 게 맞는 동작이라(아래
  // "provinceMembers를 넘기지 않아도..." 테스트가 그 시나리오를 전담) 이 테스트의 원래 취지
  // (지역 계층 3단계 순서 자체)를 그대로 검증하려면 "도내의 다른 시"(수원시)로 바꿔야 한다.
  // 또한 makeChainable(비필터링 스텁)은 실제 SQL 단 지역 필터링을 전혀 검증하지 못해(토큰이
  // 뭐든 항상 같은 데이터를 반환) 서초구 오피딩 버그를 애초에 잡아내지 못했던 원인 중 하나였다
  // — makeFilteringChainable로 바꿔 실제 쿼리 필터링까지 검증한다.
  it('Task 9-4-3: 1순위 부족 시 같은 상위 시(성남시)를 2순위로, 도내 다른 시는 3순위로 채운다', async () => {
    const otherCity = eventRow({ id: 'suwon', title: '수원 행사', sigungu_name: '수원시', is_active: true });
    const sameParentCity = eventRow({ id: 'jungwon', title: '중원구 행사', sigungu_name: '성남시 중원구', is_active: true });
    const selected = eventRow({ id: 'bundang', title: '분당 행사', sigungu_name: '성남시 분당구', is_active: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({ from: () => makeFilteringChainable([otherCity, sameParentCity, selected]) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '성남시 분당구' });

    expect(items.map((item) => item.id)).toEqual(['bundang', 'jungwon', 'suwon']);
  });

  // Task 9-6-6(2026-08-23): "/events/today" 전용 지역 계층 피딩 — region.provinceMembers가
  // 있으면 3순위(부족분 채우기) 조회도 그 목록(예: 경기도 31개 시/군)으로만 제한되어, 목록에
  // 없는 타 지자체(서울 서초구 등)는 완전히 배제되어야 한다(기존 9-4-3처럼 "그 외 지역"으로
  // 섞여 들어가면 안 됨).
  it('Task 9-6-6: provinceMembers가 있으면 3순위 조회도 그 목록으로 제한해 타 지자체를 완전히 차단한다', async () => {
    const seoul = eventRow({ id: 'seoul', title: '서초구 행사', sigungu_name: '서초구', is_active: true });
    const suwon = eventRow({ id: 'suwon', title: '수원 행사', sigungu_name: '수원시', is_active: true });
    const bundang = eventRow({ id: 'bundang', title: '분당 행사', sigungu_name: '성남시 분당구', is_active: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([seoul, suwon, bundang]) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, {
      sigunguName: '성남시 분당구',
      provinceMembers: ['수원시', '성남시'],
    });

    expect(items.map((item) => item.id).sort()).toEqual(['bundang', 'suwon']);
    expect(items.some((item) => item.id === 'seoul')).toBe(false);
  });

  // Task 9-6-7(2026-08-23) 버그 수정 + Task 9-6-9(2026-08-23) 정책 변경: "성남시 분당구" 설정
  // 시 provinceMembers를 명시적으로 넘기지 않아도 sigunguName만으로 소속 권역을 자동 판별해
  // 차단해야 한다. 단 Task 9-6-9부터는 서울/경기가 "수도권"으로 통합되어, 서울 데이터(서초구)는
  // 더 이상 차단 대상이 아니라 정당하게 3순위로 섞여 들어온다 — 진짜 "지방"(부산 등)만 차단된다.
  it('Task 9-6-9: 성남시 분당구 기준이면 수도권(서울) 데이터는 섞이고, 지방 데이터는 차단된다', async () => {
    const seoul = eventRow({ id: 'seoul', title: '서초구 행사', sigungu_name: '서초구', is_active: true });
    const busan = eventRow({ id: 'busan', title: '부산 행사', sigungu_name: '해운대구', is_active: true });
    const bundang = eventRow({ id: 'bundang', title: '분당 행사', sigungu_name: '성남시 분당구', is_active: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([seoul, busan, bundang]) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '성남시 분당구' });

    expect(items.map((item) => item.id).sort()).toEqual(['bundang', 'seoul']);
    expect(items.some((item) => item.id === 'busan')).toBe(false);
  });

  // 인식 불가능한(경기도/서울 어느 목록에도 없는) sigunguName이면 기존처럼 지역 제한 없는
  // 폴백을 유지한다 — 이 서비스가 아직 다루지 않는 지역을 임의로 차단하지 않는다(추측 금지).
  it('Task 9-6-7: 경기도/서울 어디에도 속하지 않는 sigunguName이면 기존처럼 지역 제한 없이 폴백한다', async () => {
    const unknown = eventRow({ id: 'unknown', title: '알 수 없는 지역 행사', sigungu_name: '청주시', is_active: true });
    const jeju = eventRow({ id: 'jeju', title: '제주 행사', sigungu_name: '제주시', is_active: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([unknown, jeju]) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '청주시' });

    expect(items.map((item) => item.id).sort()).toEqual(['jeju', 'unknown']);
  });

  it('정규화된 (행사명+시군구) 기준 중복을 병합하고, 하나라도 무료면 무료로 남긴다', async () => {
    const paid = eventRow({ id: 'paid-dup', title: '분당 여름 축제', sigungu_name: '성남시 분당구', is_free: false });
    const free = eventRow({ id: 'free-dup', title: '분당  여름 축제', sigungu_name: '성남시 분당구', is_free: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [paid, free], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items).toHaveLength(1);
    expect(items[0].is_free).toBe(true);
  });

  it('Task 9-1-8: 앞에 붙는 회차 라벨만 다른 반복 프로그램을 대표 1건으로 묶는다', async () => {
    const withMonth = eventRow({ id: 'a', title: '(주말가족) 8월 대모산유아숲', sigungu_name: '강남구' });
    const withoutMonth = eventRow({ id: 'b', title: '(주말가족)대모산유아숲', sigungu_name: '강남구' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [withMonth, withoutMonth], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items).toHaveLength(1);
  });

  it('Task 9-1-8: 뒤에 붙는 회차/대상 정보만 다른 시리즈물을 대표 1건으로 묶고, 결측 sigungu_name은 실제 값으로 채운다', async () => {
    const noRegion = eventRow({
      id: 'zine-noregion',
      title: '용산ZINE: 맛있는 용산 이야기 8월 ~ 10월 예약 안내 (4~6학년 대상)',
      sigungu_name: null,
    });
    const withRegion = eventRow({
      id: 'zine-region',
      title: '용산ZINE: 맛있는 용산 이야기 8월 ~ 10월 예약 안내 (1~3학년 대상)',
      sigungu_name: '용산구',
    });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [noRegion, withRegion], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items).toHaveLength(1);
    expect(items[0].sigungu_name).toBe('용산구');
  });

  it('Task 9-1-8: 같은 제목 핵심 키라도 실제 지역이 서로 다르면(동명 이벤트) 병합하지 않는다', async () => {
    const gangnam = eventRow({ id: 'series-gangnam', title: '서울숲, 휴휴산방(9월, 섬유가 된 식물)', sigungu_name: '강남구' });
    const seongdong = eventRow({ id: 'series-seongdong', title: '서울숲, 휴휴산방(8월, 리스DIY)', sigungu_name: '성동구' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [gangnam, seongdong], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items).toHaveLength(2);
  });
});

describe('getFreeFeed (Task 9-1-3: open_spaces+events 지역 우선 정렬)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  // Task 9-6-4(2026-08-23): getFreeFeed는 이제 dataType('events' 기본 | 'open_spaces')당 한
  // 테이블만 조회한다(대분류 토글에 맞춰 섞지 않음) — 기존 "합쳐서" 테스트를 각 테이블별로
  // 분리해 지역 우선 정렬 자체는 여전히 정확한지 검증한다.
  it('dataType=open_spaces면 open_spaces 안에서 선택 지역을 1순위로 정렬한다', async () => {
    const matching = {
      id: 's1',
      name: '무료 공원',
      category: 'OUTDOOR_NATURE',
      address: '경기도 성남시 중원구 산성대로 194',
      location: { coordinates: [127.14, 37.44] },
      is_free: true,
      operating_hours: null,
      info_url: null,
      is_kids_friendly: false,
      has_parking: false,
      stroller_accessible: false,
      facility_type: '복합',
      target_age_group: null,
      sigungu_name: '성남시 중원구',
    };
    const other = { ...matching, id: 's2', sigungu_name: '강남구', address: '서울특별시 강남구 어딘가' };

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [other, matching], error: null }) }),
    }));

    const { getFreeFeed } = await import('./get-home-feed');
    const items = await getFreeFeed(10, { sigunguName: '성남시 중원구' }, 'open_spaces');

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('s1');
  });

  it('dataType=events(기본값)면 events 안에서 선택 지역을 1순위로 정렬한다', async () => {
    const matching = eventRow({ id: 'e1', sigungu_name: '성남시 중원구' });
    const other = eventRow({ id: 'e2', sigungu_name: '강남구', venue_name: '강남 어딘가' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [other, matching], error: null }) }),
    }));

    const { getFreeFeed } = await import('./get-home-feed');
    const items = await getFreeFeed(10, { sigunguName: '성남시 중원구' });

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('e1');
  });
});

// 사용자 피드백(2026-08-22): 위치가 초기에 없다가 설정/재설정되면(좌표를 알게 되면) 실제
// 거리순으로 노출되어야 한다. 좌표를 모르는(기본값) 상태에서는 이 정렬이 적용되지 않는다.
describe('위치 설정/재설정 시 가까운 순 정렬', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('getTodayEvents: region에 좌표가 있으면 같은 지역 안에서도 가까운 순서로 정렬한다', async () => {
    const origin = { lat: 37.5, lng: 127.0 };
    const far = eventRow({
      id: 'far',
      title: '먼 행사',
      location: { coordinates: [127.5, 37.9] }, // origin에서 상당히 먼 좌표
    });
    const near = eventRow({
      id: 'near',
      title: '가까운 행사',
      location: { coordinates: [127.001, 37.501] }, // origin 바로 근처
    });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [far, near], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '성남시 분당구', ...origin });

    expect(items[0].id).toBe('near');
    expect(items[1].id).toBe('far');
    expect(items[0].distance_meters).toBeLessThan(items[1].distance_meters);
  });

  it('getTodayEvents: region에 좌표가 없으면(기본값) 거리 정렬을 적용하지 않는다(distance_meters는 -1 유지)', async () => {
    const row = eventRow();

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [row], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '성남시 분당구' });

    expect(items[0].distance_meters).toBe(-1);
  });

  // Task 9-6-4(2026-08-23): dataType별로 나뉘었으므로 "합쳐서 거리순 정렬"이 아니라 각
  // 테이블 안에서 거리순 정렬이 여전히 정확한지로 나눠 검증한다.
  it('getFreeFeed: dataType=open_spaces면 open_spaces 안에서 가까운 순서로 정렬한다', async () => {
    const origin = { lat: 37.5, lng: 127.0 };
    const far = {
      id: 'space-far',
      name: '먼 공원',
      category: 'OUTDOOR_NATURE',
      address: '경기도 성남시 분당구 어딘가',
      location: { coordinates: [127.5, 37.9] },
      is_free: true,
      operating_hours: null,
      info_url: null,
      is_kids_friendly: false,
      has_parking: false,
      stroller_accessible: false,
      facility_type: '복합',
      target_age_group: null,
      sigungu_name: '성남시 분당구',
    };
    const near = { ...far, id: 'space-near', name: '가까운 공원', location: { coordinates: [127.001, 37.501] } };

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [far, near], error: null }) }),
    }));

    const { getFreeFeed } = await import('./get-home-feed');
    const items = await getFreeFeed(10, { sigunguName: '성남시 분당구', ...origin }, 'open_spaces');

    expect(items[0].id).toBe('space-near');
    expect(items[1].id).toBe('space-far');
  });

  it('getFreeFeed: dataType=events(기본값)면 events 안에서 가까운 순서로 정렬한다', async () => {
    const origin = { lat: 37.5, lng: 127.0 };
    const far = eventRow({ id: 'event-far', title: '먼 무료 행사', location: { coordinates: [127.5, 37.9] } });
    const near = eventRow({
      id: 'event-near',
      title: '가까운 무료 행사',
      location: { coordinates: [127.001, 37.501] },
    });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [far, near], error: null }) }),
    }));

    const { getFreeFeed } = await import('./get-home-feed');
    const items = await getFreeFeed(10, { sigunguName: '성남시 분당구', ...origin });

    expect(items[0].id).toBe('event-near');
    expect(items[1].id).toBe('event-far');
  });
});

// Task 9-1-9: 당일 진행 이벤트가 10개 미만이면 "이번 주 시작 예정 마감임박" 행사로 10개까지 채운다.
// Task 9-6-9(2026-08-23): "이번 주 시작 예정 마감임박으로 최소 10개 채우기"(Task 9-1-9의
// getUpcomingDeadlineFill/HERO_MIN_COUNT)를 완전히 제거했다 — 이제 당일 한정 조건에 맞는
// 건수가 곧 최종 결과다(0건이면 빈 배열, N건이면 N개 그대로, 10개로 억지로 채우지 않음).
describe('getTodayEvents: 10개 강제 채움 로직 제거, 가변 수량 그대로 반환 (Task 9-6-9)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('당일 한정 조건에 맞는 이벤트가 2건뿐이면 채우지 않고 2건 그대로 반환한다(다른 지역/다른 목적의 보충 조회로 채워지지 않음)', async () => {
    const todayRows = [
      eventRow({ id: 'today-1', title: '오늘 행사 1' }),
      eventRow({ id: 'today-2', title: '오늘 행사 2' }),
    ];

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: todayRows, error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    // limit=10이어도 조건에 맞는 게 2건뿐이면 2건 그대로 — "이번 주 마감임박"류로 나머지
    // 8건을 채우는 로직(Task 9-1-9)이 완전히 제거됐다.
    expect(items.map((i) => i.id)).toEqual(['today-1', 'today-2']);
  });

  it('조건에 맞는 이벤트가 0건이면 빈 배열을 반환한다(홈 화면이 섹션을 숨기는 근거)', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: makeSequentialFrom([[]]) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items).toEqual([]);
  });
});

// Task 9-6-9(2026-08-23): getTodayEvents가 이제 "당일 진행 중"(범위 포함)이 아니라
// "당일 한정"(end_date가 정확히 오늘)만 조회한다.
describe('getTodayEvents: 당일 한정(end_date=오늘) 조건 강화 (Task 9-6-9)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('end_date가 오늘이 아니면(몇 주짜리 장기 행사 등) 제외한다', async () => {
    const longRunning = eventRow({
      id: 'long-running',
      title: '장기 전시',
      start_date: '2026-08-01',
      end_date: '2026-09-30',
      is_active: true,
    });
    const endsToday = eventRow({ id: 'ends-today', title: '오늘 마감 행사', is_active: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([longRunning, endsToday]) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: null });

    expect(items.map((i) => i.id)).toEqual(['ends-today']);
  });
});

// Task 9-1-4: 실측으로 발견한 버그 재현 — 한 소스(예: GG_EVENTS)가 다른 지역 데이터보다 압도적으로
// 최근에 대량 수집돼 "최신순 500건" 후보군을 통째로 차지하면, 선택 지역(성남시 분당구) 데이터가
// 실제로 있어도 후보군에서 완전히 밀려나 피드에 노출되지 않는다. sigungu_name을 SQL 단에서 먼저
// 필터링(인덱스 활용)해 이 문제를 막았는지 검증한다.
describe('getFreeFeed: 대량 단일 소스가 후보군을 독점해도 선택 지역 데이터가 밀려나지 않는다 (Task 9-1-4)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('다른 지역(GG_EVENTS류) 500건이 더 최신이어도 선택 지역(성남시 분당구) 무료 공간이 노출된다', async () => {
    // 실제 버그 재현: "다른 지역" 대량 데이터 500건 + 선택 지역 데이터 1건, 최신순 정렬이면
    // 선택 지역 데이터가 500건 밖으로 밀려난다.
    const dominantOtherRegionRows = Array.from({ length: 500 }, (_, i) => ({
      id: `gg-${i}`,
      name: `오산시 시설 ${i}`,
      category: 'OUTDOOR_NATURE',
      address: '경기도 오산시 어딘가',
      location: { coordinates: [127.07, 37.15] },
      is_free: true,
      operating_hours: null,
      info_url: null,
      is_kids_friendly: false,
      has_parking: false,
      stroller_accessible: false,
      facility_type: '복합',
      target_age_group: null,
      sigungu_name: '오산시',
    }));
    const selectedRegionRow = {
      id: 'bundang-1',
      name: '분당 무료 공원',
      category: 'OUTDOOR_NATURE',
      address: '경기도 성남시 분당구 어딘가',
      location: { coordinates: [127.12, 37.38] },
      is_free: true,
      operating_hours: null,
      info_url: null,
      is_kids_friendly: false,
      has_parking: false,
      stroller_accessible: false,
      facility_type: '복합',
      target_age_group: null,
      sigungu_name: '성남시 분당구',
    };
    const allSpaceRows = [...dominantOtherRegionRows, selectedRegionRow];

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          from: (table: string) =>
            table === 'open_spaces' ? makeFilteringChainable(allSpaceRows) : makeChainable({ data: [], error: null }),
        }),
    }));

    const { getFreeFeed } = await import('./get-home-feed');
    const items = await getFreeFeed(12, { sigunguName: '성남시 분당구' }, 'open_spaces');

    expect(items.some((item) => item.id === 'bundang-1')).toBe(true);
  });
});

// Task 9-5-1(2026-08-22): 목적별 테마 스팟 통합 피드 — 상시 공간(open_spaces, source_type
// 기반)과 개장 중인 시즌 행사(events, 키워드 기반)가 한 목록으로 묶여 나오는지 검증한다.
describe('getThemeSpotFeed (Task 9-5-1: 목적별 테마 스팟 통합 피딩)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  // Task 9-6-4(2026-08-23): getThemeSpotFeed도 dataType당 한 테이블만 조회하도록 바뀌어
  // "합쳐서" 검증하던 기존 테스트를 테이블별로 분리한다.
  it('dataType=open_spaces면 source_type 기준으로 같은 테마 항목만 반환한다', async () => {
    const pool = {
      id: 'pool-1',
      name: '분당 실내수영장',
      category: 'KIDS_ACTIVITY',
      address: '경기도 성남시 분당구 어딘가',
      location: { coordinates: [127.12, 37.38] },
      is_free: true,
      operating_hours: null,
      info_url: null,
      is_kids_friendly: false,
      has_parking: false,
      stroller_accessible: false,
      facility_type: '실내',
      target_age_group: null,
      sigungu_name: '성남시 분당구',
      source_type: 'SWIMMING_POOL',
    };
    const playground = {
      ...pool,
      id: 'playground-1',
      name: '분당 어린이놀이터',
      source_type: 'LOCALDATA_PLAYGROUND',
    };

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([pool, playground]) }),
    }));

    const { getThemeSpotFeed } = await import('./get-home-feed');
    const items = await getThemeSpotFeed('SWIMMING', 20, { sigunguName: '성남시 분당구' }, 'open_spaces');

    const ids = items.map((item) => item.id);
    expect(ids).toContain('pool-1');
    expect(ids).not.toContain('playground-1');
  });

  it('dataType=events(기본값)면 키워드 기준으로 같은 테마 항목만 반환한다', async () => {
    const waterEvent = eventRow({
      id: 'water-event',
      title: '탄천 여름 물놀이장',
      venue_name: '탄천 물놀이장',
      is_active: true,
    });
    const unrelatedEvent = eventRow({ id: 'other-event', title: '가을 음악회', venue_name: '문화회관', is_active: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([waterEvent, unrelatedEvent]) }),
    }));

    const { getThemeSpotFeed } = await import('./get-home-feed');
    const items = await getThemeSpotFeed('SWIMMING', 20, { sigunguName: '성남시 분당구' });

    const ids = items.map((item) => item.id);
    expect(ids).toContain('water-event');
    expect(ids).not.toContain('other-event');
  });
});

describe('getCategoryFeed (Task 9-6-17: 5대 카테고리 인라인 피딩)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('event_type이 일치하고 오늘 진행 중인 이벤트만 반환한다', async () => {
    const kidsEvent = eventRow({ id: 'kids-event', event_type: 'KIDS_ACTIVITY', is_active: true });
    const otherCategoryEvent = eventRow({ id: 'other-category', event_type: 'OUTDOOR_NATURE', is_active: true });
    const inactiveKidsEvent = eventRow({ id: 'inactive-kids', event_type: 'KIDS_ACTIVITY', is_active: false });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          from: () => makeFilteringChainable([kidsEvent, otherCategoryEvent, inactiveKidsEvent]),
        }),
    }));

    const { getCategoryFeed } = await import('./get-home-feed');
    const items = await getCategoryFeed('KIDS_ACTIVITY', 20, { sigunguName: '성남시 분당구' });

    const ids = items.map((item) => item.id);
    expect(ids).toEqual(['kids-event']);
  });
});

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "Hero 카드 구역 - 위치 기반 정렬 순서")
describe('getTodayEvents 경기/서울 우선순위 정렬', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('사용자 위치가 경기도면, 정확 일치 지역이 없을 때 경기도 항목을 서울시 항목보다 먼저 보여준다', async () => {
    const seoulItem = eventRow({ id: 'seoul-1', title: '서울 행사', sigungu_name: '강남구', venue_name: '강남 문화센터' });
    const gyeonggiItem = eventRow({ id: 'gyeonggi-1', title: '경기 행사', sigungu_name: '수원시', venue_name: '수원 문화센터' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [seoulItem, gyeonggiItem], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    // 사용자가 "고양시"(경기도)에 있고, 정확 일치(고양시)/상위 시 일치 항목은 없어 두 항목 모두
    // 기존 로직상 같은 "그 외 수도권" 순위로 떨어지는 상황을 재현한다.
    const items = await getTodayEvents(10, { sigunguName: '고양시' });

    expect(items.map((item) => item.id)).toEqual(['gyeonggi-1', 'seoul-1']);
  });

  it('사용자 위치가 서울시면, 서울시 항목을 경기도 항목보다 먼저 보여준다', async () => {
    const seoulItem = eventRow({ id: 'seoul-1', title: '서울 행사', sigungu_name: '강남구', venue_name: '강남 문화센터' });
    const gyeonggiItem = eventRow({ id: 'gyeonggi-1', title: '경기 행사', sigungu_name: '수원시', venue_name: '수원 문화센터' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [seoulItem, gyeonggiItem], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '마포구' });

    expect(items.map((item) => item.id)).toEqual(['seoul-1', 'gyeonggi-1']);
  });
});

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "당일 예약 필요 카드 구역")
describe('getReservationOpenEvents', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('booking_status="접수중"인 이벤트를 반환한다', async () => {
    const openEvent = eventRow({ id: 'open-1', booking_status: '접수중', is_active: true });
    const closedEvent = eventRow({ id: 'closed-1', booking_status: '오늘방문', is_active: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([openEvent, closedEvent]) }),
    }));

    const { getReservationOpenEvents } = await import('./get-home-feed');
    const items = await getReservationOpenEvents(10, { sigunguName: null });

    expect(items.map((item) => item.id)).toEqual(['open-1']);
  });

  // SEOUL_YEYAK(source='seoul_public_reservation')은 booking_status 컬럼을 채우지 않고 원본
  // SVCSTATNM만 raw_data JSONB에 보존한다(seoul-yeyak-adapter.mjs 실측 확인).
  it('SEOUL_YEYAK 소스는 booking_status 대신 raw_data의 원본 SVCSTATNM="접수중"으로 판별한다', async () => {
    const yeyakOpen = eventRow({
      id: 'yeyak-open',
      booking_status: null,
      is_active: true,
      source: 'seoul_public_reservation',
      'raw_data->>SVCSTATNM': '접수중',
    });
    const yeyakClosed = eventRow({
      id: 'yeyak-closed',
      booking_status: null,
      is_active: true,
      source: 'seoul_public_reservation',
      'raw_data->>SVCSTATNM': '접수마감',
    });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([yeyakOpen, yeyakClosed]) }),
    }));

    const { getReservationOpenEvents } = await import('./get-home-feed');
    const items = await getReservationOpenEvents(10, { sigunguName: null });

    expect(items.map((item) => item.id)).toEqual(['yeyak-open']);
  });

  it('두 조건 모두에 해당하는 행이 있어도 중복 없이 한 번만 반환한다', async () => {
    const dup = eventRow({
      id: 'dup',
      booking_status: '접수중',
      is_active: true,
      source: 'seoul_public_reservation',
      'raw_data->>SVCSTATNM': '접수중',
    });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([dup]) }),
    }));

    const { getReservationOpenEvents } = await import('./get-home-feed');
    const items = await getReservationOpenEvents(10, { sigunguName: null });

    expect(items.map((item) => item.id)).toEqual(['dup']);
  });
});

// [이벤트픽 화면 개편](2026-08-27 사용자 지시): "예약 가능" 위에 두는 "현재 이용 가능" 섹션 —
// 예약 상태와 무관하게 오늘이 진행 기간(start_date~end_date) 안에 있으면 노출한다.
describe('getCurrentlyOngoingEvents', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('오늘이 start_date~end_date 범위 안에 있는 행사만 반환한다', async () => {
    const ongoing = eventRow({ id: 'ongoing', start_date: '2026-08-01', end_date: '2026-09-30', is_active: true });
    const notStartedYet = eventRow({
      id: 'not-started',
      start_date: '2099-01-01',
      end_date: '2099-01-31',
      is_active: true,
    });
    const alreadyEnded = eventRow({
      id: 'already-ended',
      start_date: '2000-01-01',
      end_date: '2000-01-31',
      is_active: true,
    });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([ongoing, notStartedYet, alreadyEnded]) }),
    }));

    const { getCurrentlyOngoingEvents } = await import('./get-home-feed');
    const items = await getCurrentlyOngoingEvents(10, { sigunguName: null });

    expect(items.map((item) => item.id)).toEqual(['ongoing']);
  });

  it('하루짜리 행사도(start_date=end_date=오늘) 포함한다', async () => {
    const oneDayEvent = eventRow({ id: 'one-day', is_active: true });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeFilteringChainable([oneDayEvent]) }),
    }));

    const { getCurrentlyOngoingEvents } = await import('./get-home-feed');
    const items = await getCurrentlyOngoingEvents(10, { sigunguName: null });

    expect(items.map((item) => item.id)).toEqual(['one-day']);
  });
});

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "GNB 헤더 & 검색")
describe('searchEvents', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('title에 ilike 검색 패턴("%keyword%")을 걸어 events만 조회한다', async () => {
    const row = eventRow({ id: 'match-1', title: '분당 여름 물놀이 체험' });
    const ilikeMock = vi.fn(() => builder);
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.ilike = ilikeMock;
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.not = () => builder;
    builder.gte = () => builder;
    builder.order = () => builder;
    builder.limit = () => Promise.resolve({ data: [row], error: null });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => builder }),
    }));

    const { searchEvents } = await import('./get-home-feed');
    const items = await searchEvents('물놀이');

    expect(ilikeMock).toHaveBeenCalledWith('title', '%물놀이%');
    expect(items[0].id).toBe('match-1');
    expect(items[0].name).toBe('분당 여름 물놀이 체험');
  });
});
