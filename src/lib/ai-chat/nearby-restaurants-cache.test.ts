import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNearbyRestaurantsCache, getCachedNearbyRestaurants } from './nearby-restaurants-cache';

afterEach(() => clearNearbyRestaurantsCache());

describe('getCachedNearbyRestaurants', () => {
  it('같은 좌표로 두 번 호출하면 fetcher를 한 번만 실행한다', async () => {
    const fetcher = vi.fn(() => Promise.resolve({ items: [], radiusMeters: 1000 }));

    await getCachedNearbyRestaurants(37.5665, 126.978, fetcher);
    await getCachedNearbyRestaurants(37.5665, 126.978, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('부동소수점 미세 오차가 있는 좌표도 같은 캐시로 취급한다(4자리 반올림)', async () => {
    const fetcher = vi.fn(() => Promise.resolve({ items: [], radiusMeters: 1000 }));

    await getCachedNearbyRestaurants(37.56650001, 126.978, fetcher);
    await getCachedNearbyRestaurants(37.5665, 126.978, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('다른 좌표는 각각 별도로 조회한다', async () => {
    const fetcher = vi.fn(() => Promise.resolve({ items: [], radiusMeters: 1000 }));

    await getCachedNearbyRestaurants(37.5665, 126.978, fetcher);
    await getCachedNearbyRestaurants(35.1796, 129.0756, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('동시에 여러 번 호출해도(경쟁 상태) 진행 중인 Promise 하나만 공유한다', async () => {
    let resolveFetch: (v: { items: []; radiusMeters: number }) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<{ items: []; radiusMeters: number }>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = getCachedNearbyRestaurants(37.5665, 126.978, fetcher);
    const p2 = getCachedNearbyRestaurants(37.5665, 126.978, fetcher);
    resolveFetch({ items: [], radiusMeters: 5000 });
    await Promise.all([p1, p2]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('실패한 요청은 캐싱하지 않아 다음 호출에서 재시도할 수 있다', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ items: [], radiusMeters: 1000 });

    await expect(getCachedNearbyRestaurants(37.5665, 126.978, fetcher)).rejects.toThrow('network error');
    const result = await getCachedNearbyRestaurants(37.5665, 126.978, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ items: [], radiusMeters: 1000 });
  });
});
