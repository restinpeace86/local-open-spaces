// [지오코딩 안전장치 — 서킷 브레이커/타임아웃/카카오 폴백](2026-09-05 사용자 지시) 단위
// 테스트. 실측으로 확인한 실제 장애(V-World UND_ERR_CONNECT_TIMEOUT 연속 발생)를
// 재현해 ① 서킷 브레이커가 연속 3회 연결 실패 후 열리는지, ② 카카오로 자동 폴백하는지,
// ③ 두 지오코더 모두 실패해도 예외를 던지지 않고 null로 안전하게 끝나는지 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { geocode, hasVworldApiKey } = await import('./vworld-geocoder.mjs');
const { isVworldCircuitOpen, resetVworldCircuitBreakerForTest } = await import('./vworld-circuit-breaker.mjs');

// fetchVworld의 재시도 간 sleep(1000ms/2000ms/3000ms)이 실제로 걸리는 테스트라 이 파일은
// 다른 단위 테스트보다 느리다 — 서킷 브레이커가 "연속 3회"에서 열리도록 설계돼 있어
// 첫 주소 하나만 최악(3회 실패까지) 대기하고, 이후 호출은 즉시 건너뛴다.
const CONNECT_TIMEOUT_ERROR = new TypeError(
  'fetch failed: UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: api.vworld.kr:443, timeout: 10000ms)'
);

function vworldOkResponse(point) {
  return { ok: true, json: async () => ({ response: { status: 'OK', result: { point } } }) };
}

function vworldNotFoundResponse() {
  return { ok: true, json: async () => ({ response: { status: 'NOT_FOUND' } }) };
}

describe('vworld-geocoder + 서킷 브레이커/카카오 폴백', () => {
  beforeEach(() => {
    resetVworldCircuitBreakerForTest();
    process.env.VWORLD_API_KEY = 'test-vworld-key';
    delete process.env.KAKAO_REST_API_KEY;
  });

  it('hasVworldApiKey는 환경변수 존재 여부를 그대로 반환한다', () => {
    expect(hasVworldApiKey()).toBe(true);
    delete process.env.VWORLD_API_KEY;
    expect(hasVworldApiKey()).toBe(false);
  });

  it('V-World가 정상 응답하면 그대로 좌표를 반환한다(카카오 호출 없음)', async () => {
    const fetchMock = vi.fn((url) => {
      expect(url).toContain('api.vworld.kr');
      return Promise.resolve(vworldOkResponse({ x: '127.1', y: '37.3' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await geocode('경기도 성남시 분당구 판교역로 1');

    expect(result).toEqual({ lng: 127.1, lat: 37.3 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // ROAD 1차 시도에서 바로 성공
    expect(isVworldCircuitOpen()).toBe(false);
  });

  it('V-World가 NOT_FOUND면(서버는 정상) 서킷을 열지 않고 null을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(vworldNotFoundResponse())));

    const result = await geocode('존재하지 않는 주소');

    expect(result).toBeNull();
    expect(isVworldCircuitOpen()).toBe(false);
  });

  it(
    '연결 타임아웃이 연속 3회 발생하면 서킷 브레이커를 열고, 카카오 키가 있으면 즉시 폴백한다',
    async () => {
      process.env.KAKAO_REST_API_KEY = 'test-kakao-key';
      const fetchMock = vi.fn((url) => {
        if (url.includes('api.vworld.kr')) return Promise.reject(CONNECT_TIMEOUT_ERROR);
        if (url.includes('dapi.kakao.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ documents: [{ x: '127.1', y: '37.3' }] }),
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await geocode('경기도 성남시 분당구 판교역로 1');

      expect(result).toEqual({ lng: 127.1, lat: 37.3 });
      expect(isVworldCircuitOpen()).toBe(true);
      const vworldCalls = fetchMock.mock.calls.filter((c) => c[0].includes('api.vworld.kr'));
      // MAX_RETRIES=3(4회 시도) 중 연속 3회 실패 시점(3번째 시도)에서 즉시 포기 — 4번째
      // 시도까지 소진하지 않는다.
      expect(vworldCalls.length).toBe(3);

      // 서킷이 열린 뒤 다른 주소를 다시 조회하면 V-World는 아예 다시 호출하지 않고
      // 카카오로 바로 간다.
      fetchMock.mockClear();
      const second = await geocode('다른 주소');
      expect(second).toEqual({ lng: 127.1, lat: 37.3 });
      expect(fetchMock.mock.calls.some((c) => c[0].includes('api.vworld.kr'))).toBe(false);
    },
    15000
  );

  it('V-World와 카카오 둘 다 실패해도 예외를 던지지 않고 null을 반환한다', async () => {
    process.env.KAKAO_REST_API_KEY = 'test-kakao-key';
    const fetchMock = vi.fn((url) => {
      if (url.includes('api.vworld.kr')) return Promise.reject(CONNECT_TIMEOUT_ERROR);
      if (url.includes('dapi.kakao.com')) return Promise.resolve({ ok: true, json: async () => ({ documents: [] }) });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(geocode('경기도 성남시 분당구 판교역로 1')).resolves.toBeNull();
  }, 15000);

  it('카카오 키가 없으면 V-World 실패 시 조용히 null을 반환한다(예외 없음)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(CONNECT_TIMEOUT_ERROR)));

    await expect(geocode('경기도 성남시 분당구 판교역로 1')).resolves.toBeNull();
  }, 15000);
});
