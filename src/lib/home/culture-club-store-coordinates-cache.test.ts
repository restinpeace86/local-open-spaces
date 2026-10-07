import { afterEach, describe, expect, it, vi } from 'vitest';

// [성능 최적화 — 지점 좌표 캐싱](2026-10-07 사용자 지적: "성능 너무 느린데?")
// — get_culture_club_store_coordinates RPC 왕복(~600ms, 행 수와 무관한
// 고정 지연, 실측 확인)을 짧은 TTL로 캐싱해 같은 서버 인스턴스에서의
// 반복 호출을 줄인다.
describe('getCachedStoreCoordinates', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
    vi.useRealTimers();
  });

  it('TTL 내 반복 호출은 RPC를 한 번만 호출하고 캐시를 재사용한다', async () => {
    const rpcMock = vi.fn(() => Promise.resolve({ data: [{ external_id: 'EMART_STORE_1', lat: 1, lng: 1 }], error: null }));
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
    const { getCachedStoreCoordinates } = await import('./culture-club-store-coordinates-cache');

    const first = await getCachedStoreCoordinates();
    const second = await getCachedStoreCoordinates();

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('TTL이 지나면 다시 RPC를 호출한다', async () => {
    vi.useFakeTimers();
    const rpcMock = vi.fn(() => Promise.resolve({ data: [{ external_id: 'EMART_STORE_1', lat: 1, lng: 1 }], error: null }));
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
    const { getCachedStoreCoordinates } = await import('./culture-club-store-coordinates-cache');

    await getCachedStoreCoordinates();
    vi.advanceTimersByTime(6 * 60 * 1000);
    await getCachedStoreCoordinates();

    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('RPC 에러는 그대로 던진다', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }));
    const { getCachedStoreCoordinates } = await import('./culture-club-store-coordinates-cache');

    await expect(getCachedStoreCoordinates()).rejects.toThrow('boom');
  });
});
