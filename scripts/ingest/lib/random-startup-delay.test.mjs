import { describe, expect, it, vi } from 'vitest';
import { applyRandomStartupDelay, randomStartupDelayMs } from './random-startup-delay.mjs';

describe('randomStartupDelayMs', () => {
  it('0 이상 maxMs 이하의 값을 반환한다', () => {
    for (let i = 0; i < 20; i++) {
      const delay = randomStartupDelayMs(1000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });

  it('maxMs가 0이거나 음수면 0을 반환한다', () => {
    expect(randomStartupDelayMs(0)).toBe(0);
    expect(randomStartupDelayMs(-100)).toBe(0);
  });

  it('maxMs가 숫자가 아니면 0을 반환한다', () => {
    expect(randomStartupDelayMs(NaN)).toBe(0);
    expect(randomStartupDelayMs(undefined)).toBe(0);
  });
});

describe('applyRandomStartupDelay', () => {
  it('지연 후 실제로 기다린 시간(ms)을 반환한다', async () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const promise = applyRandomStartupDelay(1000, { log });
    await vi.runAllTimersAsync();
    const delayMs = await promise;

    expect(delayMs).toBeGreaterThanOrEqual(0);
    expect(delayMs).toBeLessThanOrEqual(1000);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('랜덤 시작 지연'));
    vi.useRealTimers();
  });

  it('maxMs가 0이면 지연 로그를 남기지 않는다', async () => {
    const log = vi.fn();
    const delayMs = await applyRandomStartupDelay(0, { log });

    expect(delayMs).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });
});
