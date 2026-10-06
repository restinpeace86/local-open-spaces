import { afterEach, describe, expect, it, vi } from 'vitest';

// [문화센터 통합검색 — 기본 필터 2종](2026-10-07, Decision 028 연장) —
// 거리순 정렬 경로의 핵심 로직(PostgREST 1,000건 truncation을 범위를 나눠
// 우회, 거리로 재정렬 후 페이지를 자름)을 검증한다. 실제 라이브 테스트 중
// "가장 가까운 지점"이 틀리게 나왔던 버그(.limit()만으로는 1,000건에서
// 조용히 잘림)의 회귀 테스트.

type Row = { id: number; brand: string; store_code: string; schedule_start_date: string };

function makeRow(id: number, brand: string, storeCode: string): Row {
  return { id, brand, store_code: storeCode, schedule_start_date: '2026-10-10' };
}

function mockAdminClient({
  rowsByRange,
  coords,
}: {
  rowsByRange: (from: number, to: number) => Row[];
  coords: { external_id: string; lng: number; lat: number }[];
}) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    overlaps: () => chain,
    or: () => chain,
    ilike: () => chain,
    order: () => chain,
    range: (from: number, to: number) => Promise.resolve({ data: rowsByRange(from, to), error: null }),
    // count 쿼리는 head:true라 select()에서 바로 awaitable을 반환해야 하는데,
    // 이 모의 체인은 select() 호출 시점에 count 옵션을 구분하지 않으므로
    // count 쿼리 경로는 아래에서 별도 처리한다(then 구현).
    then: (resolve: (v: { data: null; error: null; count: number }) => void) => resolve({ data: null, error: null, count: 3722 }),
  };
  const fromMock = vi.fn(() => chain);
  const rpcMock = vi.fn(() => Promise.resolve({ data: coords, error: null }));
  return { fromMock, rpcMock };
}

describe('GET /api/culture-club/search — 거리순 정렬', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('지점이 100개 분량(1,000건 경계를 넘는 2페이지)로 나뉘어도 전부 합쳐 거리순으로 정렬한다', async () => {
    // offset 0: 먼 지점 1000건, offset 1000: 가까운 지점 1건(2번째 페이지에만 존재)
    // — .limit()만 썼다면 2번째 페이지가 통째로 누락돼 가까운 지점을 놓쳤을 것.
    const farRows = Array.from({ length: 1000 }, (_, i) => makeRow(i, 'emart', 'FAR'));
    const nearRow = makeRow(9999, 'emart', 'NEAR');

    const { fromMock, rpcMock } = mockAdminClient({
      rowsByRange: (from) => (from === 0 ? farRows : from === 1000 ? [nearRow] : []),
      coords: [
        { external_id: 'EMART_STORE_FAR', lng: 127.5, lat: 38.0 },
        { external_id: 'EMART_STORE_NEAR', lng: 126.978, lat: 37.5665 },
      ],
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/search?lat=37.5665&lng=126.978&page=1&page_size=5') as never);
    const body = await res.json();

    expect(body.items[0].store_code).toBe('NEAR');
    expect(body.items[0].distance_meters).toBeLessThan(1000);
  });

  it('좌표가 없는 지점(조인 실패)은 거리 정렬에서 맨 뒤로 밀린다', async () => {
    const knownRow = makeRow(1, 'emart', 'KNOWN');
    const unknownRow = makeRow(2, 'emart', 'UNKNOWN_STORE');

    const { fromMock, rpcMock } = mockAdminClient({
      rowsByRange: (from) => (from === 0 ? [unknownRow, knownRow] : []),
      coords: [{ external_id: 'EMART_STORE_KNOWN', lng: 126.978, lat: 37.5665 }],
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/search?lat=37.5665&lng=126.978&page=1&page_size=5') as never);
    const body = await res.json();

    expect(body.items[0].store_code).toBe('KNOWN');
    expect(body.items[1].store_code).toBe('UNKNOWN_STORE');
    expect(body.items[1].distance_meters).toBeNull();
  });
});

describe('GET /api/culture-club/search — age_months 파라미터', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('age_months가 있으면 연령 겹침 OR 조건을 쿼리에 추가한다(위치 파라미터 없는 기본 경로)', async () => {
    const orCalls: string[] = [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data: [], error: null }),
      or: (filter: string) => {
        orCalls.push(filter);
        return chain;
      },
      then: (resolve: (v: { data: null; error: null; count: number }) => void) => resolve({ data: null, error: null, count: 0 }),
    };
    const fromMock = vi.fn(() => chain);
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));
    const { GET } = await import('./route');

    await GET(new Request('http://localhost/api/culture-club/search?age_months=36') as never);

    expect(orCalls.some((f) => f.includes('min_age_months.lte.36') && f.includes('max_age_months.gte.36'))).toBe(true);
  });
});
