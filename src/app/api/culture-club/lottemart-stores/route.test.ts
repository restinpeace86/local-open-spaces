import { afterEach, describe, expect, it, vi } from 'vitest';

// [계층형 지점 선택 — 반경 내 지점만](2026-10-07 todo.md 개선사항1-3): 이마트
// 지점 API(stores/route.test.ts)와 동일한 거리/반경 로직을 검증한다. 기존엔
// 이 라우트가 정적 목록만 반환해 테스트가 없었다.

describe('GET /api/culture-club/lottemart-stores', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('위치 파라미터가 없으면 전체 지점을 가나다순으로 그대로 반환한다', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/lottemart-stores') as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.stores.length).toBeGreaterThan(0);
    expect(data.stores[0].distanceMeters).toBeUndefined();
  });

  it('lat/lng가 있으면 distanceMeters를 포함해 거리순으로 정렬한다', async () => {
    // 실제 LOTTEMART_STORES 중 두 지점의 external_id로 가상의 좌표를 준다.
    const rpcMock = vi.fn(() =>
      Promise.resolve({
        data: [
          { external_id: 'LOTTEMART_STORE_455', lng: 126.978, lat: 37.5665 }, // 고양점
          { external_id: 'LOTTEMART_STORE_322', lng: 129.0, lat: 35.0 }, // 송파점 — 임의로 멀게
        ],
        error: null,
      })
    );
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/lottemart-stores?lat=37.5665&lng=126.978') as never);
    const data = await res.json();

    const goyang = data.stores.find((s: { storeCode: string }) => s.storeCode === '455');
    const songpa = data.stores.find((s: { storeCode: string }) => s.storeCode === '322');
    expect(goyang.distanceMeters).toBeLessThan(songpa.distanceMeters);
  });

  it('radius_km을 벗어난 지점은 목록에서 제외된다', async () => {
    const rpcMock = vi.fn(() =>
      Promise.resolve({
        data: [
          { external_id: 'LOTTEMART_STORE_455', lng: 126.978, lat: 37.5665 },
          { external_id: 'LOTTEMART_STORE_322', lng: 129.0, lat: 35.0 },
        ],
        error: null,
      })
    );
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
    const { GET } = await import('./route');

    const res = await GET(new Request('http://localhost/api/culture-club/lottemart-stores?lat=37.5665&lng=126.978&radius_km=10') as never);
    const data = await res.json();

    expect(data.stores.map((s: { storeCode: string }) => s.storeCode)).toEqual(['455']);
  });
});
