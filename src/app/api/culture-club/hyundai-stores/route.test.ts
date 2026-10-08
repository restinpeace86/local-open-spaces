import { afterEach, describe, expect, it, vi } from 'vitest';

// [현대백화점 — 지점 목록 API](2026-10-08 사용자 지적): "관리자 화면도
// 이마트랑 롯데마트밖에없네 조건이? 신세계랑 현백 필터링조건이 없는데?" —
// shinsegae-stores/route.test.ts와 동일한 검증 구조, HYUNDAI_STORE_
// 접두사만 다르다.
function makeSelectBuilder(result: { data: unknown[] | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => Promise.resolve(result);
  return builder;
}

describe('GET /api/culture-club/hyundai-stores', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('HYUNDAI_STORE_ 접두사를 벗겨 store_code를 만들고 display_name+지역을 라벨로 쓴다', async () => {
    const builder = makeSelectBuilder({
      data: [
        { external_id: 'HYUNDAI_STORE_220', display_name: '현대백화점 무역센터점', name: '현대백화점 무역센터점', address: '서울 강남구 테헤란로 517' },
        { external_id: 'SHINSEGAE_STORE_03', display_name: '신세계 타임스퀘어 & ON', name: '신세계백화점 타임스퀘어점', address: '서울 영등포구 영중로 15' },
      ],
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/hyundai-stores') as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.stores).toEqual([{ storeCode: '220', label: '현대백화점 무역센터점 (서울 강남구)' }]);
  });

  it('DB 조회가 실패하면 500을 반환한다', async () => {
    const builder = makeSelectBuilder({ data: null, error: { message: 'db down' } });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/hyundai-stores') as never);

    expect(res.status).toBe(500);
  });
});
