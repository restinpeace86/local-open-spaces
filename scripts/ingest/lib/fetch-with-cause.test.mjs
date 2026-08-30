// [핵심 events 수집 파이프라인 장애 점검 후속](2026-08-30) 단위 테스트
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCause } from './fetch-with-cause.mjs';

describe('fetchWithCause', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('성공 시 원래 fetch와 동일하게 응답을 그대로 반환한다', async () => {
    const fakeResponse = { ok: true };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(fakeResponse))
    );

    const res = await fetchWithCause('https://example.com');

    expect(res).toBe(fakeResponse);
  });

  it('TypeError에 cause가 있으면 원인을 메시지에 포함해 다시 던진다', async () => {
    const cause = new Error('getaddrinfo ENOTFOUND example.com');
    const fetchError = new TypeError('fetch failed', { cause });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(fetchError))
    );

    await expect(fetchWithCause('https://example.com')).rejects.toThrow(
      'fetch failed (원인: getaddrinfo ENOTFOUND example.com)'
    );
  });

  it('cause가 Error가 아닌 값이어도 문자열로 변환해 포함한다', async () => {
    const fetchError = new TypeError('fetch failed', { cause: 'ECONNREFUSED' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(fetchError))
    );

    await expect(fetchWithCause('https://example.com')).rejects.toThrow('fetch failed (원인: ECONNREFUSED)');
  });

  it('cause가 없는 에러는 원본 그대로 던진다(다른 종류의 에러를 오염시키지 않음)', async () => {
    const plainError = new Error('HTTP 403');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(plainError))
    );

    await expect(fetchWithCause('https://example.com')).rejects.toThrow('HTTP 403');
  });
});
