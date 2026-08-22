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

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    title: '테스트 행사',
    event_type: 'PERFORMANCE_FESTIVAL',
    location: { coordinates: [127.1287, 37.3809] },
    thumbnail_url: null,
    start_date: '2026-08-22',
    end_date: '2026-08-22',
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

  it('open_spaces와 events를 합쳐 선택 지역을 1순위로 정렬한다', async () => {
    const spaceRow = {
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
    const eventRowData = eventRow({ id: 'e-free', sigungu_name: '강남구' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          from: (table: string) =>
            makeChainable({ data: table === 'open_spaces' ? [spaceRow] : [eventRowData], error: null }),
        }),
    }));

    const { getFreeFeed } = await import('./get-home-feed');
    const items = await getFreeFeed(10, { sigunguName: '성남시 중원구' });

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('s1');
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

  it('getFreeFeed: region에 좌표가 있으면 open_spaces/events를 합쳐 가까운 순서로 정렬한다', async () => {
    const origin = { lat: 37.5, lng: 127.0 };
    const spaceRow = {
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
    const nearEvent = eventRow({
      id: 'event-near',
      title: '가까운 무료 행사',
      location: { coordinates: [127.001, 37.501] },
    });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          from: (table: string) =>
            makeChainable({ data: table === 'open_spaces' ? [spaceRow] : [nearEvent], error: null }),
        }),
    }));

    const { getFreeFeed } = await import('./get-home-feed');
    const items = await getFreeFeed(10, { sigunguName: '성남시 분당구', ...origin });

    expect(items[0].id).toBe('event-near');
    expect(items[1].id).toBe('space-far');
  });
});

// Task 9-1-9: 당일 진행 이벤트가 10개 미만이면 "이번 주 시작 예정 마감임박" 행사로 10개까지 채운다.
describe('getTodayEvents: 당일 데이터 부족 시 이번 주 마감임박으로 채움 (Task 9-1-9)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('당일 이벤트가 2건뿐이면 이번 주 마감임박 이벤트로 나머지 8건을 채워 총 10건을 만든다', async () => {
    const todayRows = [
      eventRow({ id: 'today-1', title: '오늘 행사 1' }),
      eventRow({ id: 'today-2', title: '오늘 행사 2' }),
    ];
    const upcomingRows = Array.from({ length: 8 }, (_, i) =>
      eventRow({
        id: `upcoming-${i}`,
        title: `다음 주 행사 ${i}`,
        start_date: '2026-08-25',
        end_date: '2026-08-27',
        reservation_end_date: `2026-08-2${i % 5}T00:00:00Z`,
      })
    );

    // getTodayEvents가 createClient()를 두 번(당일 조회 → 마감임박 보충 조회) 호출하므로,
    // 순번 카운터를 mock 팩토리 바깥에서 한 번만 만들어 두 호출 사이에 상태가 유지되게 한다.
    const sharedFrom = makeSequentialFrom([todayRows, upcomingRows]);
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: sharedFrom }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items).toHaveLength(10);
    expect(items.slice(0, 2).map((i) => i.id)).toEqual(['today-1', 'today-2']);
    expect(items.slice(2).every((i) => i.id.startsWith('upcoming-'))).toBe(true);
  });

  it('당일 이벤트가 이미 10건 이상이면 이번 주 마감임박 조회를 하지 않는다', async () => {
    const todayRows = Array.from({ length: 10 }, (_, i) => eventRow({ id: `today-${i}`, title: `오늘 행사 ${i}` }));
    const fromSpy = vi.fn(makeSequentialFrom([todayRows, []]));

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: fromSpy }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10);

    expect(items).toHaveLength(10);
    // events 테이블은 "당일" 조회 1번만 호출되고, 마감임박 보충 조회는 발생하지 않는다.
    expect(fromSpy).toHaveBeenCalledTimes(1);
  });
});
