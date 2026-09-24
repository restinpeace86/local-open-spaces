import { afterEach, describe, expect, it, vi } from 'vitest';

// [스팟 큐레이션 요일별 영업시간](2026-09-19 사용자 지시) 실측 발견: 관리자 API
// (/api/admin/spot-curations)에는 operating_hours_by_day를 저장/PATCH하도록
// 고쳤지만, 유저 화면이 실제로 읽는 이 공개 조회 라우트는 select() 컬럼 목록이
// 하드코딩돼 있어(select('*') 아님) 새 컬럼을 빠뜨리면 DB에는 저장돼도 화면에는
// 영원히 안 보이는 조용한 버그가 된다 — 라이브 서버로 직접 재현해서 발견했다.
// 이 테스트는 그 회귀를 다시 잡기 위한 것: select에 실제로 넘긴 컬럼 목록에
// operating_hours_by_day가 포함되는지, 응답이 그 값을 그대로 통과시키는지 확인한다.
function makeChainable(row: Record<string, unknown> | null) {
  const calls: { select?: string } = {};
  const builder: Record<string, unknown> = {};
  builder.select = (columns: string) => {
    calls.select = columns;
    return builder;
  };
  builder.eq = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: row, error: null });
  return { builder, calls };
}

describe('GET /api/spot-curations', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('select 컬럼 목록에 operating_hours_by_day가 포함된다(회귀 방지)', async () => {
    const { builder, calls } = makeChainable({
      id: 'c1',
      spot_id: 'space-1',
      image_url: null,
      operating_hours_raw: null,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
      last_order: null,
      operating_hours_by_day: [{ day: '월', open: '14:00', close: '22:00' }],
      menu_items: [],
      child_fee: null,
      guardian_fee: null,
      naver_booking_url: null,
      curation_note: null,
      curation_badges: [],
      min_age_recommended: 0,
      open_spaces: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/spot-curations?spot_id=space-1') as never);
    const data = await res.json();

    expect(calls.select).toContain('operating_hours_by_day');
    expect(data.item.operating_hours_by_day).toEqual([{ day: '월', open: '14:00', close: '22:00' }]);
  });

  // [네이버 예약 버튼 자동 생성](2026-09-25 사용자 지시): open_spaces 조인에서
  // naver_place_id를 뽑아 응답 최상위 필드로 내려주는지 확인한다.
  it('open_spaces.naver_place_id를 최상위 naver_place_id 필드로 내려준다', async () => {
    const { builder, calls } = makeChainable({
      id: 'c1',
      spot_id: 'space-1',
      image_url: null,
      operating_hours_raw: null,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
      last_order: null,
      operating_hours_by_day: null,
      menu_items: [],
      child_fee: null,
      guardian_fee: null,
      naver_booking_url: null,
      curation_note: null,
      curation_badges: ['reservation_possible'],
      min_age_recommended: 0,
      open_spaces: { naver_place_id: '2095637824', service_categories: { category_name: '음식점' } },
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/spot-curations?spot_id=space-1') as never);
    const data = await res.json();

    expect(calls.select).toContain('naver_place_id');
    expect(data.item.naver_place_id).toBe('2095637824');
    expect(data.item.open_spaces).toBeUndefined();
  });

  it('spot_id가 없으면 400을 반환한다', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/spot-curations') as never);
    expect(res.status).toBe(400);
  });
});
