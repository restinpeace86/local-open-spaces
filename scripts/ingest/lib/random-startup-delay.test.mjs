import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const originalEventName = process.env.GITHUB_EVENT_NAME;

  afterEach(() => {
    if (originalEventName === undefined) {
      delete process.env.GITHUB_EVENT_NAME;
    } else {
      process.env.GITHUB_EVENT_NAME = originalEventName;
    }
  });

  it('예약 실행(schedule)일 때는 지연 후 실제로 기다린 시간(ms)을 반환한다', async () => {
    process.env.GITHUB_EVENT_NAME = 'schedule';
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

  it('maxMs가 0이면(예약 실행이어도) 지연 로그를 남기지 않는다', async () => {
    process.env.GITHUB_EVENT_NAME = 'schedule';
    const log = vi.fn();
    const delayMs = await applyRandomStartupDelay(0, { log });

    expect(delayMs).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it('GITHUB_EVENT_NAME이 schedule이 아니면(수동 트리거/로컬 실행) 지연을 생략한다', async () => {
    delete process.env.GITHUB_EVENT_NAME;
    const log = vi.fn();
    const delayMs = await applyRandomStartupDelay(1000, { log });

    expect(delayMs).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('생략'));
  });

  it('GITHUB_EVENT_NAME이 workflow_dispatch면 지연을 생략한다', async () => {
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    const log = vi.fn();
    const delayMs = await applyRandomStartupDelay(1000, { log });

    expect(delayMs).toBe(0);
  });
});
