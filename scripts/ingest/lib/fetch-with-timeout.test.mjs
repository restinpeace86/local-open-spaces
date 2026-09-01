import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './fetch-with-timeout.mjs';

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('정상 응답이면 그대로 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200 })));

    const res = await fetchWithTimeout('https://example.com/api');
    expect(res.ok).toBe(true);
  });

  it('타임아웃 시 "fetch timeout" 문구가 포함된 에러를 던진다(retry.mjs의 재시도 대상 판별과 호환)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          })
      )
    );

    const promise = fetchWithTimeout('https://example.com/slow', {}, 30000);
    const assertion = expect(promise).rejects.toThrow(/fetch timeout after 30000ms/);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
  });

  it('이미 signal이 넘어오면 별도 타임아웃을 걸지 않고 그대로 위임한다', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    await fetchWithTimeout('https://example.com/api', { signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api', { signal: controller.signal });
  });

  it('네트워크 계층 실패(err.cause 있음)는 fetchWithCause를 거쳐 원인이 메시지에 포함된다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const cause = new Error('ECONNREFUSED');
        cause.code = 'ECONNREFUSED';
        const err = new TypeError('fetch failed');
        err.cause = cause;
        return Promise.reject(err);
      })
    );

    await expect(fetchWithTimeout('https://example.com/api')).rejects.toThrow(/fetch failed.*ECONNREFUSED/s);
  });
});
