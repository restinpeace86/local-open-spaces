import { describe, expect, it } from 'vitest';
import { formatPriceInput, parsePriceInput } from './format-price';

describe('formatPriceInput', () => {
  it('빈 문자열이면 빈 문자열을 반환한다', () => {
    expect(formatPriceInput('')).toBe('');
  });

  it('숫자만 입력하면 천 단위 콤마를 붙인다', () => {
    expect(formatPriceInput('50000')).toBe('50,000');
    expect(formatPriceInput('1234567')).toBe('1,234,567');
  });

  it('숫자가 아닌 문자는 무시한다(이미 콤마가 붙은 값을 다시 넣어도 안전)', () => {
    expect(formatPriceInput('50,000')).toBe('50,000');
  });

  it('앞자리 0은 자연스럽게 사라진다', () => {
    expect(formatPriceInput('0050000')).toBe('50,000');
  });
});

describe('parsePriceInput', () => {
  it('빈 문자열은 null을 반환한다(선택 입력 — 미입력)', () => {
    expect(parsePriceInput('')).toBeNull();
  });

  it('콤마가 붙은 표시값을 숫자로 되돌린다', () => {
    expect(parsePriceInput('50,000')).toBe(50000);
  });
});
