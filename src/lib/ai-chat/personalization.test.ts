import { describe, expect, it } from 'vitest';
import { ageToKidsAgeGroup, buildPersonalizedGreeting, calculateAgesFromBirthYears, deriveKidsAgeGroup } from './personalization';

describe('calculateAgesFromBirthYears', () => {
  it('현재 연도 - 출생년도로 연 나이를 계산한다', () => {
    expect(calculateAgesFromBirthYears([2021, 2018], new Date('2026-01-01'))).toEqual([5, 8]);
  });

  it('미래 출생년도(음수 나이)는 걸러낸다', () => {
    expect(calculateAgesFromBirthYears([2030], new Date('2026-01-01'))).toEqual([]);
  });
});

describe('ageToKidsAgeGroup', () => {
  it('6세 이하는 영유아', () => {
    expect(ageToKidsAgeGroup(0)).toBe('영유아');
    expect(ageToKidsAgeGroup(6)).toBe('영유아');
  });
  it('7~12세는 초등', () => {
    expect(ageToKidsAgeGroup(7)).toBe('초등');
    expect(ageToKidsAgeGroup(12)).toBe('초등');
  });
  it('13세 이상은 전연령으로 폴백', () => {
    expect(ageToKidsAgeGroup(13)).toBe('전연령');
  });
});

describe('deriveKidsAgeGroup', () => {
  it('나이가 없으면 null', () => {
    expect(deriveKidsAgeGroup([])).toBeNull();
  });
  it('전부 같은 그룹이면 그 그룹을 그대로 쓴다', () => {
    expect(deriveKidsAgeGroup([2, 4])).toBe('영유아');
  });
  it('그룹이 섞이면 전연령으로 취급한다', () => {
    expect(deriveKidsAgeGroup([2, 9])).toBe('전연령');
  });
});

describe('buildPersonalizedGreeting', () => {
  it('나이가 없으면 빈 문자열', () => {
    expect(buildPersonalizedGreeting([])).toBe('');
  });
  it('출생년도 숫자를 노출하지 않고 환산된 나이만 말한다', () => {
    const text = buildPersonalizedGreeting([4]);
    expect(text).toContain('4살 아이');
    expect(text).not.toMatch(/20\d{2}/);
  });
  it('여러 자녀면 나이를 나열한다', () => {
    expect(buildPersonalizedGreeting([2, 5])).toContain('2살, 5살 아이들');
  });
  it('displayName이 있으면 이름을 함께 부른다', () => {
    expect(buildPersonalizedGreeting([4], '민지맘')).toContain('민지맘님!');
  });
});
