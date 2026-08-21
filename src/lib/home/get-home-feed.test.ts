import { afterEach, describe, expect, it, vi } from 'vitest';

// Task 9-1-1: 반경 30km Haversine 필터링 + venue_name 매핑 검증.
// Supabase 쿼리 빌더는 메서드 체이닝 후 마지막에 .limit()이 Promise를 반환하는 구조라,
// 어떤 필터 메서드가 몇 번 호출되든 항상 자기 자신을 반환하는 체이너블 스텁으로 모킹한다.
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

const ORIGIN = { lat: 37.3809, lng: 127.1287 }; // 성남시 분당구(테스트 기준점, 실제 DEFAULT_HOME_ORIGIN과 동일)

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    title: '테스트 행사',
    event_type: 'PERFORMANCE_FESTIVAL',
    location: { coordinates: [127.1287, 37.3809] }, // origin과 동일 좌표 = 거리 0
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
    ...overrides,
  };
}

describe('getTodayEvents / getFreeFeed (Task 9-1-1: 반경 30km + venue_name)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('반경 30km 이내 행사만 남기고, venue_name을 address로 매핑한다', async () => {
    const nearRow = eventRow({ id: 'near', venue_name: '분당 근처 행사장' });
    // 부산(약 300km+ 떨어진 좌표) — 30km 밖이라 걸러져야 함
    const farRow = eventRow({ id: 'far', location: { coordinates: [129.0756, 35.1796] }, venue_name: '부산 먼 행사장' });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          from: () => makeChainable({ data: [nearRow, farRow], error: null }),
        }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, ORIGIN);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('near');
    expect(items[0].address).toBe('분당 근처 행사장');
    expect(items[0].distance_meters).toBeLessThan(30000);

    vi.doUnmock('@/lib/supabase/server');
  });

  it('venue_name이 없으면 address도 null이다(가짜 장소명 생성 안 함)', async () => {
    const row = eventRow({ venue_name: null });

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => Promise.resolve({ from: () => makeChainable({ data: [row], error: null }) }),
    }));

    const { getTodayEvents } = await import('./get-home-feed');
    const items = await getTodayEvents(10, ORIGIN);

    expect(items[0].address).toBeNull();

    vi.doUnmock('@/lib/supabase/server');
  });
});
