import { afterEach, describe, expect, it, vi } from 'vitest';

// [문화센터 통합검색 — Branch-First 성능 최적화](2026-10-07, todo.md 개선사항1
// 연장) — 지점(124개)부터 거리를 계산해 반경/브랜드/지점으로 좁힌 뒤, 그
// 지점들에 속한 강좌만 조회한다(이전엔 필터링된 강좌 전체를 끌어와 메모리에서
// 거리를 계산했다). PostgREST 1,000건 truncation을 범위를 나눠 우회하는
// 로직의 회귀 테스트도 함께 둔다.

type Row = { id: number; brand: string; store_code: string; schedule_start_date: string };

function makeRow(id: number, brand: string, storeCode: string): Row {
  return { id, brand, store_code: storeCode, schedule_start_date: '2026-10-10' };
}

function mockAdminClient({
  rowsByRange,
  coords,
  total,
}: {
  rowsByRange: (from: number, to: number) => Row[];
  coords: { external_id: string; lng: number; lat: number }[];
  total: number;
}) {
  // [AK플라자 브랜드명 불일치 버그 회귀 테스트용](2026-10-09) or()가 실제
  // PostgREST처럼 필터링하진 않지만(기존 테스트들이 그 가정에 의존), 호출
  // 인자(store-scope 필터 문자열)는 캡처해 parseExternalId가 만든 brand
  // 값이 culture_club_classes.brand의 실제 값과 일치하는지 검증할 수 있게
  // 한다.
  const orMock = vi.fn((_filter?: string) => chain);
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    overlaps: () => chain,
    or: orMock,
    ilike: () => chain,
    order: () => chain,
    range: (from: number, to: number) => Promise.resolve({ data: rowsByRange(from, to), error: null }),
    // count 쿼리는 head:true라 select()에서 바로 awaitable을 반환해야 하는데,
    // 이 모의 체인은 select() 호출 시점에 count 옵션을 구분하지 않으므로
    // count 쿼리 경로는 아래에서 별도 처리한다(then 구현). count는 실제
    // range 호출 개수(fetchCeiling)를 결정하므로 테스트마다 명시적으로 넘긴다.
    then: (resolve: (v: { data: null; error: null; count: number }) => void) => resolve({ data: null, error: null, count: total }),
  };
  const fromMock = vi.fn(() => chain);
  const rpcMock = vi.fn(() => Promise.resolve({ data: coords, error: null }));
  return { fromMock, rpcMock, orMock };
}

describe('GET /api/culture-club/search — Branch-First 거리순 정렬', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('지점이 1,000건 경계를 넘는 2페이지로 나뉘어도 전부 합쳐 거리순으로 정렬한다', async () => {
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
      total: 1001,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/search?lat=37.5665&lng=126.978&page=1&page_size=5') as never);
    const body = await res.json();

    expect(body.items[0].store_code).toBe('NEAR');
    expect(body.items[0].distance_meters).toBeLessThan(1000);
  });

  // [AK플라자 브랜드명 불일치 버그](2026-10-09 실측으로 발견) external_id
  // 접두사 "AKPLAZA_STORE_"를 그대로 소문자화하면 "akplaza"가 되는데,
  // culture_club_classes.brand의 실제 값은 "ak_plaza"(언더스코어 포함)라
  // store-scope 필터가 전혀 매칭되지 않아 AK플라자 강좌가 조용히 0건으로
  // 누락됐다(라이브 API 호출로 재현 확인). 다른 4개 브랜드는 external_id
  // 접두사가 brand 값과 1:1로 일치해 이 불일치가 드러나지 않았었다.
  it('AKPLAZA_STORE_ 접두사는 store-scope 필터에서 brand를 "ak_plaza"(언더스코어 포함)로 정규화한다', async () => {
    const { fromMock, rpcMock, orMock } = mockAdminClient({
      rowsByRange: () => [makeRow(1, 'ak_plaza', '02')],
      coords: [{ external_id: 'AKPLAZA_STORE_02', lng: 127.0, lat: 37.2655 }],
      total: 1,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    await GET(new Request('http://localhost/api/culture-club/search?lat=37.2655&lng=127.0') as never);

    const storeScopeFilter = orMock.mock.calls.find(([arg]) => (arg as string).includes('store_code.in'))?.[0] as string;
    expect(storeScopeFilter).toContain('brand.eq.ak_plaza');
    expect(storeScopeFilter).not.toContain('brand.eq.akplaza');
  });

  // [롯데백화점도 동일한 패턴 — 처음부터 알리아스로 대비](2026-10-09)
  // "LOTTEDEPT_STORE_" 접두사도 소문자화하면 "lottedept"가 되는데 brand
  // 값은 "lotte_department"다 — AK플라자 때 겪은 버그를 재현하지 않도록
  // 처음부터 등록한 알리아스가 실제로 동작하는지 검증한다.
  it('LOTTEDEPT_STORE_ 접두사는 store-scope 필터에서 brand를 "lotte_department"로 정규화한다', async () => {
    const { fromMock, rpcMock, orMock } = mockAdminClient({
      rowsByRange: () => [makeRow(1, 'lotte_department', '0025')],
      coords: [{ external_id: 'LOTTEDEPT_STORE_0025', lng: 127.14, lat: 35.82 }],
      total: 1,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    await GET(new Request('http://localhost/api/culture-club/search?lat=35.82&lng=127.14') as never);

    const storeScopeFilter = orMock.mock.calls.find(([arg]) => (arg as string).includes('store_code.in'))?.[0] as string;
    expect(storeScopeFilter).toContain('brand.eq.lotte_department');
    expect(storeScopeFilter).not.toContain('brand.eq.lottedept');
  });

  it('위치 기반 조회엔 지점의 실제 좌표(store_lat/store_lng)도 함께 내려준다(2026-10-07 — 위치 팝업용)', async () => {
    const { fromMock, rpcMock } = mockAdminClient({
      rowsByRange: () => [makeRow(1, 'emart', 'NEAR')],
      coords: [{ external_id: 'EMART_STORE_NEAR', lng: 126.978, lat: 37.5665 }],
      total: 1,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/search?lat=37.5665&lng=126.978') as never);
    const body = await res.json();

    expect(body.items[0].store_lat).toBe(37.5665);
    expect(body.items[0].store_lng).toBe(126.978);
  });

  it('반경(radius_km)을 벗어난 지점은 애초에 조회 대상에서 제외되고, DB를 아예 조회하지 않는다', async () => {
    const { fromMock, rpcMock } = mockAdminClient({
      rowsByRange: () => [makeRow(1, 'emart', 'FAR')],
      coords: [{ external_id: 'EMART_STORE_FAR', lng: 129.0, lat: 35.0 }], // 서울에서 매우 먼 지점
      total: 1,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/search?lat=37.5665&lng=126.978&radius_km=10') as never);
    const body = await res.json();

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('반경 내 지점만 남으면 그 지점들의 강좌만 거리순으로 보인다', async () => {
    const nearRow = makeRow(1, 'emart', 'NEAR');
    const { fromMock, rpcMock } = mockAdminClient({
      rowsByRange: () => [nearRow],
      coords: [
        { external_id: 'EMART_STORE_NEAR', lng: 126.978, lat: 37.5665 },
        { external_id: 'EMART_STORE_FAR', lng: 129.0, lat: 35.0 },
      ],
      total: 1,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/search?lat=37.5665&lng=126.978&radius_km=10') as never);
    const body = await res.json();

    expect(body.items[0].store_code).toBe('NEAR');
    expect(fromMock).toHaveBeenCalled();
  });

  it('지점 다중 선택(store_codes)이 있으면 선택된 지점으로만 좁힌다', async () => {
    const { fromMock, rpcMock } = mockAdminClient({
      rowsByRange: () => [makeRow(1, 'emart', 'A'), makeRow(2, 'emart', 'B')],
      coords: [
        { external_id: 'EMART_STORE_A', lng: 126.978, lat: 37.5665 },
        { external_id: 'EMART_STORE_B', lng: 126.98, lat: 37.57 },
        { external_id: 'EMART_STORE_C', lng: 126.99, lat: 37.58 },
      ],
      total: 2,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/search?lat=37.5665&lng=126.978&store_codes=A,B') as never);
    const body = await res.json();

    expect(body.items.map((i: Row) => i.store_code).sort()).toEqual(['A', 'B']);
  });

  // [Branch-First 전환으로 obsolete됨] 이전엔 강좌를 먼저 전부 끌어온 뒤 지점
  // 좌표로 "조인"해 거리를 매겼고, 좌표가 없는 지점은 null 거리로 맨 뒤에
  // 노출됐다. Branch-First는 반대 순서라 지점 좌표가 없으면 애초에 candidates
  // 후보에 들지 못해 store_code.in() 필터에서 빠진다 — 즉 위치가 주어진
  // 조회에서는 좌표 없는 지점의 강좌가 아예 보이지 않는다(위치를 모르는 지점을
  // "가깝다"고 추측하지 않는다, 제3장 제5조).
  it('좌표가 없는 지점은 위치 기반 조회에서 애초에 후보에 들지 못해 제외된다', async () => {
    const { fromMock, rpcMock } = mockAdminClient({
      rowsByRange: () => [makeRow(1, 'emart', 'KNOWN')],
      coords: [{ external_id: 'EMART_STORE_KNOWN', lng: 126.978, lat: 37.5665 }],
      total: 1,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock, rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/search?lat=37.5665&lng=126.978&store_codes=KNOWN,UNKNOWN_STORE') as never);
    const body = await res.json();

    expect(body.items.map((i: Row) => i.store_code)).toEqual(['KNOWN']);
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
