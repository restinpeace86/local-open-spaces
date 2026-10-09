import { afterEach, describe, expect, it, vi } from 'vitest';

// [문화센터 탭 — 지점 목록](2026-10-03 사용자 지시) — open_spaces의 EMART_STORE_* 행에서
// external_id 접두사를 벗겨 store_code를 복원하고, display_name(브랜드별로 정리된 이름)을
// 라벨로 쓰는지 검증한다.
// [지역 보조 표기 제거](2026-10-09 사용자 지적: "이마트 분당점 (경기 성남시) 2.4km
// 이렇게 나와 ? 일단 이마트 분당점 2.4km만나오던가") — 2026-10-03에 추가했던 주소
// 기반 지역 표기를, 뱃지에 실제 거리(km)가 같이 보이게 된 뒤로는 중복이라 뺐다.
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

  it('EMART_STORE_ 접두사를 벗겨 store_code를 만들고 display_name을 라벨로 쓴다', async () => {
    const builder = makeSelectBuilder({
      data: [
        { external_id: 'EMART_STORE_180', display_name: '이마트 춘천점', name: '이마트 춘천점' },
        { external_id: 'EMART_STORE_100', display_name: '트레이더스 킨텍스점', name: '트레이더스 홀세일 클럽 김포점' },
      ],
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/stores') as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.stores).toEqual([
      { storeCode: '180', label: '이마트 춘천점' },
      { storeCode: '100', label: '트레이더스 킨텍스점' },
    ]);
  });

  it('display_name이 없으면 name으로 대체한다', async () => {
    const builder = makeSelectBuilder({
      data: [{ external_id: 'EMART_STORE_935', display_name: null, name: '스타필드마켓 경산점' }],
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/stores') as never);
    const data = await res.json();

    expect(data.stores).toEqual([{ storeCode: '935', label: '스타필드마켓 경산점' }]);
  });

  it('EMART_STORE_ 접두사가 아닌 행은 걸러낸다(이 category_min에 다른 external_id가 섞여 들어오는 경우를 방어)', async () => {
    const builder = makeSelectBuilder({ data: [{ external_id: 'OTHER_123', display_name: '기타', name: '기타' }], error: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/stores') as never);
    const data = await res.json();

    expect(data.stores).toEqual([]);
  });

  it('DB 조회가 실패하면 500을 반환한다', async () => {
    const builder = makeSelectBuilder({ data: null, error: { message: 'db down' } });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/stores') as never);

    expect(res.status).toBe(500);
  });
});

describe('GET /api/culture-club/stores — 계층형 지점 선택(반경 내 지점만)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('lat/lng가 있으면 distanceMeters를 포함해 거리순으로 정렬한다', async () => {
    const builder = makeSelectBuilder({
      data: [
        { external_id: 'EMART_STORE_FAR', display_name: '먼 지점', name: '먼 지점', address: null },
        { external_id: 'EMART_STORE_NEAR', display_name: '가까운 지점', name: '가까운 지점', address: null },
      ],
      error: null,
    });
    const rpcMock = vi.fn(() =>
      Promise.resolve({
        data: [
          { external_id: 'EMART_STORE_FAR', lng: 129.0, lat: 35.0 },
          { external_id: 'EMART_STORE_NEAR', lng: 126.978, lat: 37.5665 },
        ],
        error: null,
      })
    );
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder, rpc: rpcMock }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/stores?lat=37.5665&lng=126.978') as never);
    const data = await res.json();

    expect(data.stores.map((s: { storeCode: string }) => s.storeCode)).toEqual(['NEAR', 'FAR']);
    expect(data.stores[0].distanceMeters).toBeLessThan(data.stores[1].distanceMeters);
  });

  it('radius_km을 벗어난 지점은 목록에서 제외된다', async () => {
    const builder = makeSelectBuilder({
      data: [
        { external_id: 'EMART_STORE_FAR', display_name: '먼 지점', name: '먼 지점', address: null },
        { external_id: 'EMART_STORE_NEAR', display_name: '가까운 지점', name: '가까운 지점', address: null },
      ],
      error: null,
    });
    const rpcMock = vi.fn(() =>
      Promise.resolve({
        data: [
          { external_id: 'EMART_STORE_FAR', lng: 129.0, lat: 35.0 },
          { external_id: 'EMART_STORE_NEAR', lng: 126.978, lat: 37.5665 },
        ],
        error: null,
      })
    );
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder, rpc: rpcMock }) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/culture-club/stores?lat=37.5665&lng=126.978&radius_km=10') as never);
    const data = await res.json();

    expect(data.stores.map((s: { storeCode: string }) => s.storeCode)).toEqual(['NEAR']);
  });
});
