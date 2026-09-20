import { describe, expect, it } from 'vitest';
import { formatPhoneNumber } from './format-phone';

describe('formatPhoneNumber', () => {
  it('3자리 이하는 그대로 반환한다', () => {
    expect(formatPhoneNumber('010')).toBe('010');
  });

  it('4~7자리는 3-N으로 나눈다', () => {
    expect(formatPhoneNumber('0101234')).toBe('010-1234');
  });

  it('8~10자리는 3-3-N으로 나눈다', () => {
    expect(formatPhoneNumber('0101234567')).toBe('010-123-4567');
  });

  it('11자리(휴대폰 표준)는 3-4-4로 나눈다', () => {
    expect(formatPhoneNumber('01012345678')).toBe('010-1234-5678');
  });

  it('숫자가 아닌 문자는 무시한다(이미 하이픈이 붙은 값을 다시 넣어도 안전)', () => {
    expect(formatPhoneNumber('010-1234-5678')).toBe('010-1234-5678');
  });

  it('11자리를 넘는 입력은 앞 11자리까지만 사용한다', () => {
    expect(formatPhoneNumber('010123456789999')).toBe('010-1234-5678');
  });
});
