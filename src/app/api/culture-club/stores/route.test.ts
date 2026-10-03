import { afterEach, describe, expect, it, vi } from 'vitest';

// [문화센터 탭 — 지점 목록](2026-10-03 사용자 지시) — open_spaces의 EMART_STORE_* 행에서
// external_id 접두사를 벗겨 store_code를 복원하고, display_name(브랜드별로 정리된 이름)을
// 라벨로 쓰는지 검증한다.
// [지점명에 지역 보조 표기 추가](2026-10-03 사용자 지적: "스타필드 안성점이라고 하면
// 얼추 다 아나? 어디인지?") — address 앞 2토큰을 괄호로 붙이는지도 검증한다.
function makeSelectBuilder(result: { data: unknown[] | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => Promise.resolve(result);
  return builder;
}

describe('GET /api/culture-club/stores', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('EMART_STORE_ 접두사를 벗겨 store_code를 만들고 display_name+지역을 라벨로 쓴다', async () => {
    const builder = makeSelectBuilder({
      data: [
        {
          external_id: 'EMART_STORE_180',
          display_name: '이마트 춘천점',
          name: '이마트 춘천점',
          address: '강원특별자치도 춘천시 경춘로 2353',
        },
        {
          external_id: 'EMART_STORE_100',
          display_name: '트레이더스 킨텍스점',
          name: '트레이더스 홀세일 클럽 김포점',
          address: '경기 고양시 일산서구 킨텍스로 217-6',
        },
      ],
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.stores).toEqual([
      { storeCode: '180', label: '이마트 춘천점 (강원특별자치도 춘천시)' },
      { storeCode: '100', label: '트레이더스 킨텍스점 (경기 고양시)' },
    ]);
  });

  it('display_name이 없으면 name으로 대체한다', async () => {
    const builder = makeSelectBuilder({
      data: [{ external_id: 'EMART_STORE_935', display_name: null, name: '스타필드마켓 경산점', address: '경북 경산시 옥산로 227' }],
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET();
    const data = await res.json();

    expect(data.stores).toEqual([{ storeCode: '935', label: '스타필드마켓 경산점 (경북 경산시)' }]);
  });

  it('address가 없으면 지역 표기 없이 지점명만 쓴다', async () => {
    const builder = makeSelectBuilder({
      data: [{ external_id: 'EMART_STORE_935', display_name: '스타필드마켓 경산점', name: '스타필드마켓 경산점', address: null }],
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET();
    const data = await res.json();

    expect(data.stores).toEqual([{ storeCode: '935', label: '스타필드마켓 경산점' }]);
  });

  it('EMART_STORE_ 접두사가 아닌 행은 걸러낸다(이 category_min에 다른 external_id가 섞여 들어오는 경우를 방어)', async () => {
    const builder = makeSelectBuilder({ data: [{ external_id: 'OTHER_123', display_name: '기타', name: '기타', address: null }], error: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET();
    const data = await res.json();

    expect(data.stores).toEqual([]);
  });

  it('DB 조회가 실패하면 500을 반환한다', async () => {
    const builder = makeSelectBuilder({ data: null, error: { message: 'db down' } });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET();

    expect(res.status).toBe(500);
  });
});
