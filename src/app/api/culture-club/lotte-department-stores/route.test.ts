import { afterEach, describe, expect, it, vi } from 'vitest';

// [롯데백화점 — 지점 목록 API](2026-10-09) akplaza-stores/route.test.ts와
// 동일한 검증 구조(제5장 제4조), LOTTEDEPT_STORE_ 접두사만 다르다.
function makeSelectBuilder(result: { data: unknown[] | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => Promise.resolve(result);
  return builder;
}

describe('GET /api/culture-club/lotte-department-stores', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('LOTTEDEPT_STORE_ 접두사를 벗겨 store_code를 만들고 display_name+지역을 라벨로 쓴다', async () => {
    const builder = makeSelectBuilder({
      data: [
        { external_id: 'LOTTEDEPT_STORE_0025', display_name: '롯데백화점 전주점', name: '롯데백화점 전주점', address: '전북 전주시 완산구 전주객사3길 1' },
        { external_id: 'AKPLAZA_STORE_02', display_name: 'AK플라자 수원점', name: 'AK플라자 수원', address: '경기 수원시 팔달구 덕영대로 924' },
      ],
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/lotte-department-stores') as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.stores).toEqual([{ storeCode: '0025', label: '롯데백화점 전주점 (전북 전주시)' }]);
  });

  it('DB 조회가 실패하면 500을 반환한다', async () => {
    const builder = makeSelectBuilder({ data: null, error: { message: 'db down' } });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/lotte-department-stores') as never);

    expect(res.status).toBe(500);
  });
});
