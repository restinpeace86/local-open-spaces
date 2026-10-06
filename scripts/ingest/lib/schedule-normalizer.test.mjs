import { describe, expect, it } from 'vitest';
import {
  koreanDayToCode,
  normalizeDaysToCodes,
  parseRoundFromTitle,
  parseTotalSessionsFromTitle,
  yyyymmddToIso,
} from './schedule-normalizer.mjs';

describe('koreanDayToCode / normalizeDaysToCodes', () => {
  it('한글 요일을 표준 3글자 코드로 변환한다', () => {
    expect(koreanDayToCode('월')).toBe('MON');
    expect(koreanDayToCode('일')).toBe('SUN');
  });

  it('알 수 없는 값은 null을 반환한다', () => {
    expect(koreanDayToCode('X')).toBeNull();
  });

  it('배열 전체를 변환하고 알 수 없는 값은 걸러낸다', () => {
    expect(normalizeDaysToCodes(['화', '목'])).toEqual(['TUE', 'THU']);
    expect(normalizeDaysToCodes(['화', 'X'])).toEqual(['TUE']);
  });

  it('배열이 아니거나 전부 걸러지면 null을 반환한다', () => {
    expect(normalizeDaysToCodes(null)).toBeNull();
    expect(normalizeDaysToCodes(['X'])).toBeNull();
  });
});

describe('yyyymmddToIso', () => {
  it('8자리 날짜 문자열을 ISO 형식으로 변환한다', () => {
    expect(yyyymmddToIso('20261012')).toBe('2026-10-12');
  });

  it('뒤에 시각(HHmm)이 더 붙어 있어도 날짜 8자만 쓴다(register_start_date 형태)', () => {
    expect(yyyymmddToIso('202608101000')).toBe('2026-08-10');
  });

  it('null/빈 값/8자 미만/숫자가 아니면 null을 반환한다', () => {
    expect(yyyymmddToIso(null)).toBeNull();
    expect(yyyymmddToIso('')).toBeNull();
    expect(yyyymmddToIso('2026101')).toBeNull();
    expect(yyyymmddToIso('2026-10-1')).toBeNull();
  });
});

describe('parseRoundFromTitle', () => {
  it('"N차" 표기에서 차수를 추출한다(스펙 예시)', () => {
    expect(parseRoundFromTitle('[3차-11/6~11/27] 4회, 신체놀이 짐짐펀')).toBe(3);
  });

  it('차수 표기가 없으면 null을 반환한다', () => {
    expect(parseRoundFromTitle('[8주] [일정변경] [특별가] (화) 13:00 대교 트니트니')).toBeNull();
  });
});

describe('parseTotalSessionsFromTitle', () => {
  it('"N회"에서 총 회차를 추출한다(스펙 예시)', () => {
    expect(parseTotalSessionsFromTitle('[3차-11/6~11/27] 4회, 신체놀이 짐짐펀')).toBe(4);
  });

  it('"N주"에서도 총 회차로 추출한다(실측: [8주])', () => {
    expect(parseTotalSessionsFromTitle('[8주][수] 주니토니 발레스타 영어발레 (24~48개월)')).toBe(8);
  });

  it('표기가 없으면 null을 반환한다', () => {
    expect(parseTotalSessionsFromTitle('10/3(토)11:50 에너지 팡팡! 키즈 플레이 그라운드')).toBeNull();
  });
});
