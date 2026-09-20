import { describe, expect, it } from 'vitest';
import {
  addDaysToDateStr,
  addMonthsToDateStr,
  formatKoreanDateWithWeekday,
  formatKoreanYearMonth,
  formatMonthDayWithWeekday,
  getFirstDayOfMonth,
  getLastDayOfMonth,
  getMondayOfWeek,
} from './date';

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

describe('formatMonthDayWithWeekday', () => {
  it('YYYY-MM-DD를 "N/N (요일)" 형식으로 바꾼다', () => {
    // 2026-09-22는 화요일이다.
    expect(formatMonthDayWithWeekday('2026-09-22')).toBe('9/22 (화)');
  });
});

describe('formatKoreanYearMonth', () => {
  it('YYYY-MM-DD를 "N년 N월" 형식으로 바꾼다', () => {
    expect(formatKoreanYearMonth('2026-09-20')).toBe('2026년 9월');
  });
});

describe('getMondayOfWeek', () => {
  it('월요일이면 그대로 반환한다', () => {
    // 2026-09-21은 월요일이다.
    expect(getMondayOfWeek('2026-09-21')).toBe('2026-09-21');
  });

  it('주중 다른 요일이면 그 주의 월요일을 반환한다', () => {
    // 2026-09-24는 목요일이다.
    expect(getMondayOfWeek('2026-09-24')).toBe('2026-09-21');
  });

  it('일요일이면 6일 전(그 주의 월요일)을 반환한다', () => {
    // 2026-09-20은 일요일이다.
    expect(getMondayOfWeek('2026-09-20')).toBe('2026-09-14');
  });
});

describe('getFirstDayOfMonth / getLastDayOfMonth', () => {
  it('그 달의 1일을 반환한다', () => {
    expect(getFirstDayOfMonth('2026-09-20')).toBe('2026-09-01');
  });

  it('30일까지 있는 달의 마지막 날을 반환한다', () => {
    expect(getLastDayOfMonth('2026-09-20')).toBe('2026-09-30');
  });

  it('윤년 2월의 마지막 날(29일)을 정확히 반환한다', () => {
    expect(getLastDayOfMonth('2028-02-10')).toBe('2028-02-29');
  });

  it('평년 2월의 마지막 날(28일)을 정확히 반환한다', () => {
    expect(getLastDayOfMonth('2026-02-10')).toBe('2026-02-28');
  });
});

describe('addMonthsToDateStr', () => {
  it('양수를 더하면 그만큼 뒤 달의 1일을 반환한다', () => {
    expect(addMonthsToDateStr('2026-09-20', 1)).toBe('2026-10-01');
  });

  it('음수를 더하면 그만큼 앞 달의 1일을 반환한다', () => {
    expect(addMonthsToDateStr('2026-09-20', -1)).toBe('2026-08-01');
  });

  it('연도 경계를 넘어가도 올바르게 계산한다', () => {
    expect(addMonthsToDateStr('2026-12-20', 1)).toBe('2027-01-01');
    expect(addMonthsToDateStr('2026-01-20', -1)).toBe('2025-12-01');
  });
});
