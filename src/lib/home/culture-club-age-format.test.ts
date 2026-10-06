import { describe, expect, it } from 'vitest';
import { formatAgeRangeMonths } from './culture-club-age-format';

describe('formatAgeRangeMonths', () => {
  it('둘 다 36개월 미만이면 개월 단위로 표시한다', () => {
    expect(formatAgeRangeMonths(8, 15)).toBe('8개월~15개월');
  });

  it('상한이 36개월 이상이면 세 단위로 통일해 표시한다', () => {
    expect(formatAgeRangeMonths(30, 40)).toBe('2세~3세');
  });

  it('min과 max가 같으면 단일 값으로 표시한다', () => {
    expect(formatAgeRangeMonths(72, 72)).toBe('6세');
  });

  it('상한만 있으면 "이하"로 표시한다', () => {
    expect(formatAgeRangeMonths(null, 48)).toBe('4세 이하');
  });

  it('하한만 있으면 "이상"으로 표시한다', () => {
    expect(formatAgeRangeMonths(36, null)).toBe('3세 이상');
  });

  it('둘 다 없으면 null을 반환한다', () => {
    expect(formatAgeRangeMonths(null, null)).toBeNull();
  });
});
