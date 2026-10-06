import { afterEach, describe, expect, it, vi } from 'vitest';

// [문화센터 통합 관리자 화면 API](2026-10-06, Decision 028) — 필터 파라미터가
// 올바른 Supabase 쿼리로 변환되는지 검증한다. store 파라미터는 `brand:storeCode`
// 복합 값을 받아 (brand, store_code) 쌍 단위 OR 조건으로 바뀌어야 한다(지점
// 코드가 브랜드마다 독립 네임스페이스라 store_code만으로는 브랜드를 가려낼 수
// 없기 때문).

function mockAdminClient() {
  const calls: { in: [string, string[]][]; or: string[] } = { in: [], or: [] };
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    in: (col: string, values: string[]) => {
      calls.in.push([col, values]);
      return chain;
    },
    or: (filter: string) => {
      calls.or.push(filter);
      return chain;
    },
    then: (resolve: (v: { data: unknown[]; error: null; count: number }) => void) => resolve({ data: [], error: null, count: 0 }),
  };
  const fromMock = vi.fn(() => chain);
  return { fromMock, calls };
}

describe('GET /api/admin/culture-club', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('brand/normalized_status는 .in()으로 필터한다', async () => {
    const { fromMock, calls } = mockAdminClient();
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));
    const { GET } = await import('./route');

    await GET(new Request('http://localhost/api/admin/culture-club?brand=emart,lottemart&normalized_status=OPEN,WAITING') as never);

    expect(calls.in).toContainEqual(['brand', ['emart', 'lottemart']]);
    expect(calls.in).toContainEqual(['normalized_status', ['OPEN', 'WAITING']]);
  });

  it('store는 brand:storeCode 복합 값을 (brand, store_code) 쌍 OR 조건으로 바꾼다', async () => {
    const { fromMock, calls } = mockAdminClient();
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));
    const { GET } = await import('./route');

    await GET(new Request('http://localhost/api/admin/culture-club?store=emart:964,lottemart:455') as never);

    expect(calls.or).toEqual(['and(brand.eq.emart,store_code.eq.964),and(brand.eq.lottemart,store_code.eq.455)']);
  });

  it('형식이 잘못된 store 값(콜론 없음)은 무시한다', async () => {
    const { fromMock, calls } = mockAdminClient();
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));
    const { GET } = await import('./route');

    await GET(new Request('http://localhost/api/admin/culture-club?store=invalid') as never);

    expect(calls.or).toEqual([]);
  });
});

describe('PATCH /api/admin/culture-club', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('id(number)와 is_excluded(boolean)가 있어야 한다', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
    const { PATCH } = await import('./route');

    const res = await PATCH(new Request('http://localhost/api/admin/culture-club', { method: 'PATCH', body: JSON.stringify({}) }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('id');
  });

  it('id로 is_excluded를 업데이트한다', async () => {
    const eqMock = vi.fn(() => Promise.resolve({ error: null }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update: updateMock }) }) }));
    const { PATCH } = await import('./route');

    const res = await PATCH(
      new Request('http://localhost/api/admin/culture-club', { method: 'PATCH', body: JSON.stringify({ id: 42, is_excluded: true }) }) as never
    );
    const body = await res.json();

    expect(body).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith({ is_excluded: true });
    expect(eqMock).toHaveBeenCalledWith('id', 42);
  });
});
