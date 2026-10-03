import { afterEach, describe, expect, it, vi } from 'vitest';

// [문화센터 탭 — 강좌 목록](2026-10-03 사용자 지시) — store_code 필수, is_excluded=false
// 고정 필터, days/sub_category_name 다중선택(OR) 쿼리 파라미터가 올바르게 전달되는지,
// store_code 없으면 400을 반환하는지 검증한다.
type QueryCalls = {
  eq: [string, unknown][];
  order?: [string, { ascending: boolean }];
  range?: [number, number];
  overlaps?: [string, unknown];
  in?: [string, unknown];
};

function makeQueryBuilder(result: { data: unknown[] | null; error: { message: string } | null; count: number | null }) {
  const calls: QueryCalls = { eq: [] };
  const builder: Record<string, unknown> & PromiseLike<typeof result> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      calls.eq.push([column, value]);
      return builder;
    },
    order: (column: string, opts: { ascending: boolean }) => {
      calls.order = [column, opts];
      return builder;
    },
    range: (from: number, to: number) => {
      calls.range = [from, to];
      return builder;
    },
    overlaps: (column: string, value: unknown) => {
      calls.overlaps = [column, value];
      return builder;
    },
    in: (column: string, value: unknown) => {
      calls.in = [column, value];
      return builder;
    },
    then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve),
  } as never;
  return { builder, calls };
}

function makeRequest(query: string) {
  return new Request(`http://localhost/api/culture-club/classes${query}`) as never;
}

describe('GET /api/culture-club/classes', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('store_code가 없으면 400을 반환한다', async () => {
    const { builder } = makeQueryBuilder({ data: [], error: null, count: 0 });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(makeRequest(''));

    expect(res.status).toBe(400);
  });

  it('is_excluded=false를 항상 고정 필터로 건다', async () => {
    const { builder, calls } = makeQueryBuilder({ data: [], error: null, count: 0 });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    await GET(makeRequest('?store_code=180'));

    expect(calls.eq).toEqual([
      ['store_code', '180'],
      ['is_excluded', false],
    ]);
  });

  it('days/sub_category_name을 콤마로 분리해 overlaps/in으로 전달한다(다중선택 OR)', async () => {
    const { builder, calls } = makeQueryBuilder({ data: [], error: null, count: 0 });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    await GET(makeRequest('?store_code=180&days=금,토&sub_category_name=Kids%20%26%20Children,With%20Mom'));

    expect(calls.overlaps).toEqual(['class_day', ['금', '토']]);
    expect(calls.in).toEqual(['sub_category_name', ['Kids & Children', 'With Mom']]);
  });

  it('page/page_size로 range를 계산한다', async () => {
    const { builder, calls } = makeQueryBuilder({ data: [], error: null, count: 0 });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    await GET(makeRequest('?store_code=180&page=2&page_size=20'));

    expect(calls.range).toEqual([20, 39]);
  });

  it('정상 응답은 items/total/page/pageSize를 반환한다', async () => {
    const { builder } = makeQueryBuilder({ data: [{ class_id: 'a' }], error: null, count: 1 });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(makeRequest('?store_code=180'));
    const data = await res.json();

    expect(data).toEqual({ items: [{ class_id: 'a' }], total: 1, page: 1, pageSize: 20 });
  });

  it('DB 조회가 실패하면 500을 반환한다', async () => {
    const { builder } = makeQueryBuilder({ data: null, error: { message: 'db down' }, count: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(makeRequest('?store_code=180'));

    expect(res.status).toBe(500);
  });
});
