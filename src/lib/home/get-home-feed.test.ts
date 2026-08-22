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
  builder.eq = self;
  builder.or = self;
  builder.order = self;
  builder.limit = () => Promise.resolve(result);
  return builder;
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

describe('getTodayEvents (Task 9-1-3: 지역 우선 정렬, 거리 계산 없음)', () => {
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

  it('유저가 선택한 지역(sigunguName) 항목을 1순위로, 그 외 지역을 2순위로 정렬한다(제외하지 않음)', async () => {
    const otherRegion = eventRow({ id: 'other', sigungu_name: '강남구' });
    const selectedRegion = eventRow({ id: 'selected', sigungu_name: '성남시 분당구' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({ from: () => makeChainable({ data: [otherRegion, selectedRegion], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, { sigunguName: '성남시 분당구' });

    // 다른 지역이라고 제외되지 않고 2건 모두 남되, 선택 지역이 먼저 온다.
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('selected');
    expect(items[1].id).toBe('other');
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
