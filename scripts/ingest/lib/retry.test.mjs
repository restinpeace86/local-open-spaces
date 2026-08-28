// [수집 파이프라인 자동 재시도 메커니즘](2026-08-28): withRetry()가 재시도 가능한 에러만
// 골라 재시도하고, 재시도 불가능한 에러나 최대 횟수 초과 시에는 그대로 던지는지 검증한다.
// 실제 대기 시간(초 단위)까지 테스트하면 느려지므로 baseDelayMs를 짧게 줘서 로직만 검증한다.
import { describe, expect, it, vi } from 'vitest';
import { isRetryableError, withRetry } from './retry.mjs';

describe('isRetryableError', () => {
  it('타임아웃/네트워크 계열 에러 메시지는 재시도 가능으로 판별한다', () => {
    expect(isRetryableError(new Error('canceling statement due to statement timeout'))).toBe(true);
    expect(isRetryableError(new Error('TypeError: fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
  });

  it('유효성 검증/인증 실패 등 영구적 에러는 재시도 불가로 판별한다', () => {
    expect(isRetryableError(new Error('open_spaces upsert 실패: null value in column violates not-null constraint'))).toBe(
      false
    );
    expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('첫 시도에 성공하면 재시도 없이 결과를 반환한다', async () => {
    const fn = vi.fn(() => Promise.resolve('ok'));
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 가능한 에러는 성공할 때까지 재시도한다', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce('ok after retries');

    const result = await withRetry(fn, { baseDelayMs: 1 });

    expect(result).toBe('ok after retries');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('재시도 불가능한 에러는 즉시 던지고 재시도하지 않는다', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('boom')));

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 가능한 에러라도 최대 횟수를 넘기면 마지막 에러를 던진다', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('network error')));

    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('network error');
    expect(fn).toHaveBeenCalledTimes(3); // 최초 시도 1회 + 재시도 2회
  });
});
