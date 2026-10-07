import { describe, expect, it } from 'vitest';
import { computeReminderWindow } from './emart-culture-club-register-reminder.mjs';

describe('computeReminderWindow', () => {
  it('10분 후를 시작점으로, 5분짜리 창을 만든다(5분 주기와 맞춤)', () => {
    const now = new Date('2026-10-08T00:00:00.000Z');
    const { windowStart, windowEnd } = computeReminderWindow(now);

    expect(windowStart.toISOString()).toBe('2026-10-08T00:10:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-10-08T00:15:00.000Z');
  });

  it('다음 실행(5분 뒤)의 창이 이번 창과 맞물려 이어진다(빈틈/중복 없음)', () => {
    const now = new Date('2026-10-08T00:00:00.000Z');
    const nextRun = new Date('2026-10-08T00:05:00.000Z');

    const current = computeReminderWindow(now);
    const next = computeReminderWindow(nextRun);

    expect(current.windowEnd.toISOString()).toBe(next.windowStart.toISOString());
  });
});
