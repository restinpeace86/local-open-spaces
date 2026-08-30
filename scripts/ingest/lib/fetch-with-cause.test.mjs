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

  // [후속 실측](2026-08-30): 실제 GitHub Actions 재발 시 cause가 전혀 없는 순수
  // "fetch failed"만 나온 것을 확인 — 이 경우 원본을 그대로 던지되(정보 손실 없음),
  // err 자체에 code/errno가 붙어 있으면 그거라도 건진다.
  it('cause는 없지만 에러 자체에 code가 있으면 그 정보를 포함한다', async () => {
    const fetchError = Object.assign(new TypeError('fetch failed'), { code: 'ECONNREFUSED' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(fetchError))
    );

    await expect(fetchWithCause('https://example.com')).rejects.toThrow(
      'fetch failed (원인: ECONNREFUSED: fetch failed)'
    );
  });

  it('cause도 code도 전혀 없으면 원본 메시지를 그대로 던진다(정보 없음을 인위적으로 만들어내지 않음)', async () => {
    const fetchError = new TypeError('fetch failed');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(fetchError))
    );

    const err = await fetchWithCause('https://example.com').catch((e) => e);
    expect(err.message).toBe('fetch failed');
  });

  it('cause가 AggregateError면 하위 에러 메시지를 전부 펼쳐 포함한다', async () => {
    const cause = new AggregateError(
      [new Error('connect ECONNREFUSED 1.1.1.1:443'), new Error('connect ECONNREFUSED 2.2.2.2:443')],
      'all failed'
    );
    const fetchError = new TypeError('fetch failed', { cause });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(fetchError))
    );

    await expect(fetchWithCause('https://example.com')).rejects.toThrow(
      'fetch failed (원인: connect ECONNREFUSED 1.1.1.1:443 | connect ECONNREFUSED 2.2.2.2:443)'
    );
  });
});
