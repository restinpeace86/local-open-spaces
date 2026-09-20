import { describe, expect, it } from 'vitest';
import { addDaysToDateStr, formatKoreanDateWithWeekday } from './date';

describe('addDaysToDateStr', () => {
  it('양수를 더하면 그만큼 뒤 날짜를 반환한다', () => {
    expect(addDaysToDateStr('2026-09-20', 1)).toBe('2026-09-21');
  });

  it('음수를 더하면 그만큼 앞 날짜를 반환한다', () => {
    expect(addDaysToDateStr('2026-09-20', -1)).toBe('2026-09-19');
  });

  it('월/연도 경계를 넘어가도 올바르게 계산한다', () => {
    expect(addDaysToDateStr('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToDateStr('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('0을 더하면 같은 날짜를 반환한다', () => {
    expect(addDaysToDateStr('2026-09-20', 0)).toBe('2026-09-20');
  });
});

describe('formatKoreanDateWithWeekday', () => {
  it('YYYY-MM-DD를 "N년 N월 N일 (요일)" 형식으로 바꾼다', () => {
    // 2026-09-20은 일요일이다.
    expect(formatKoreanDateWithWeekday('2026-09-20')).toBe('2026년 9월 20일 (일)');
  });
});
