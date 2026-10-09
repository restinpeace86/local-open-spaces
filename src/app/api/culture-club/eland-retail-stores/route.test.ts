import { afterEach, describe, expect, it, vi } from 'vitest';

// [이랜드리테일 — 지점 목록 API](2026-10-09) lotte-department-stores/
// route.test.ts와 동일한 검증 구조(제5장 제4조), ELAND_STORE_ 접두사만
// 다르다.
function makeSelectBuilder(result: { data: unknown[] | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => Promise.resolve(result);
  return builder;
}

describe('GET /api/culture-club/eland-retail-stores', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('ELAND_STORE_ 접두사를 벗겨 store_code를 만들고 display_name+지역을 라벨로 쓴다', async () => {
    const builder = makeSelectBuilder({
      data: [
        { external_id: 'ELAND_STORE_8222', display_name: 'NC백화점 부천점', name: 'NC백화점 부천점', address: '경기 부천시 원미구 송내대로 239' },
        { external_id: 'LOTTEDEPT_STORE_0025', display_name: '롯데백화점 전주점', name: '롯데백화점 전주점', address: '전북 전주시 완산구 전주객사3길 1' },
      ],
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/eland-retail-stores') as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.stores).toEqual([{ storeCode: '8222', label: 'NC백화점 부천점 (경기 부천시)' }]);
  });

  it('DB 조회가 실패하면 500을 반환한다', async () => {
    const builder = makeSelectBuilder({ data: null, error: { message: 'db down' } });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/eland-retail-stores') as never);

    expect(res.status).toBe(500);
  });
});
