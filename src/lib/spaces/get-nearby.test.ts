import { afterEach, describe, expect, it, vi } from 'vitest';

// [1,000건 truncation 버그 수정](2026-09-25 사용자 지시): "1000건 잘리면
// 안되지... 내 기준에서 1000건만 보여달라는건 없었잖아" — get_spots_by_
// service_category RPC가 PostgREST 기본 max-rows(1,000)에 걸려 조용히 잘리는
// 것을 실측으로 발견했다(캠핑장/피크닉장 3,227건 중 1,000건만 반환). 이 테스트는
// getSpotsByServiceCategory()가 .range()로 페이지를 반복 요청해 전체를 모으는지,
// 그리고 딱 페이지 경계에 걸치는 경우/빈 결과 등 경계 조건을 검증한다.
function mockRpcPages(pagesById: Record<string, unknown[][]>) {
  const rangeCalls: Array<{ from: number; to: number }> = [];
  const rpc = vi.fn((_fnName: string, params: { p_service_category_id: string }) => {
    const pages = pagesById[params.p_service_category_id] ?? [];
    return {
      range: (from: number, to: number) => {
        rangeCalls.push({ from, to });
        const pageIndex = Math.floor(from / 1000);
        const page = pages[pageIndex] ?? [];
        return Promise.resolve({ data: page, error: null });
      },
    };
  });
  vi.doMock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }));
  return { rpc, rangeCalls };
}

describe('getSpotsByServiceCategory', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/client');
    vi.resetModules();
  });

  it('한 페이지(1,000건 미만)면 한 번만 요청하고 그대로 반환한다', async () => {
    const page1 = Array.from({ length: 268 }, (_, i) => ({ id: `s${i}` }));
    const { rpc } = mockRpcPages({ 'cat-1': [page1] });

    const { getSpotsByServiceCategory } = await import('./get-nearby');
    const result = await getSpotsByServiceCategory('cat-1');

    expect(result).toHaveLength(268);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  // 실측 사례("캠핑장 / 피크닉장" 3,227건)를 그대로 재현: 1,000+1,000+1,000+227.
  it('1,000건을 초과하면 여러 페이지를 이어붙여 전체를 반환한다', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}` }));
    const page2 = Array.from({ length: 1000 }, (_, i) => ({ id: `s${1000 + i}` }));
    const page3 = Array.from({ length: 1000 }, (_, i) => ({ id: `s${2000 + i}` }));
    const page4 = Array.from({ length: 227 }, (_, i) => ({ id: `s${3000 + i}` }));
    const { rpc, rangeCalls } = mockRpcPages({ 'cat-1': [page1, page2, page3, page4] });

    const { getSpotsByServiceCategory } = await import('./get-nearby');
    const result = await getSpotsByServiceCategory('cat-1');

    expect(result).toHaveLength(3227);
    expect(rpc).toHaveBeenCalledTimes(4);
    expect(rangeCalls).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
      { from: 3000, to: 3999 },
    ]);
    // 중복/누락 없이 이어붙였는지 id로 확인.
    expect(result[0]).toEqual({ id: 's0' });
    expect(result[3226]).toEqual({ id: 's3226' });
  });

  // 정확히 페이지 경계(1,000의 배수)에 걸치는 경우 — 마지막 페이지가 꽉 차 있어도
  // 그다음 빈 페이지를 한 번 더 확인해 루프를 끝내야 한다(그렇지 않으면 "혹시
  // 정확히 1,000의 배수인 카테고리"에서 실제로는 없는 데이터를 더 있다고 오판하진
  // 않지만, 반대로 멈추는 조건이 "마지막 페이지 < PAGE_SIZE"이므로 이 케이스는
  // 자연히 한 번 더 요청하게 된다 — 그 마지막 빈 페이지 요청까지 정확히 도는지 확인).
  it('정확히 1,000의 배수(예: 2,000건)면 빈 페이지 확인까지 포함해 정확히 멈춘다', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}` }));
    const page2 = Array.from({ length: 1000 }, (_, i) => ({ id: `s${1000 + i}` }));
    const { rpc } = mockRpcPages({ 'cat-1': [page1, page2, []] });

    const { getSpotsByServiceCategory } = await import('./get-nearby');
    const result = await getSpotsByServiceCategory('cat-1');

    expect(result).toHaveLength(2000);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it('결과가 없으면(RPC가 빈 배열 반환) 빈 배열을 반환한다', async () => {
    const { rpc } = mockRpcPages({ 'cat-1': [[]] });

    const { getSpotsByServiceCategory } = await import('./get-nearby');
    const result = await getSpotsByServiceCategory('cat-1');

    expect(result).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('RPC가 에러를 반환하면 에러를 던진다', async () => {
    vi.doMock('@/lib/supabase/client', () => ({
      createClient: () => ({
        rpc: () => ({ range: () => Promise.resolve({ data: null, error: { message: 'db down' } }) }),
      }),
    }));

    const { getSpotsByServiceCategory } = await import('./get-nearby');
    await expect(getSpotsByServiceCategory('cat-1')).rejects.toThrow('노출 중분류별 공간 조회 실패');
  });
});
