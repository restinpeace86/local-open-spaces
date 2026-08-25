// Decision 017(2026-08-25) 9항 검증: 체육/공간시설의 키즈 뱃지는 USETGTINFO/MINCLASSNM
// 두 필드로만 판별해야 하고, deriveParentalTags처럼 원본 전체를 넓게 스캔해서는 안 된다.
import { describe, expect, it } from 'vitest';
import { deriveSpaceKidsFriendly } from './ai-tagging.mjs';

describe('deriveSpaceKidsFriendly', () => {
  it('USETGTINFO에 유아/어린이/초등학생/가족이 명시되면 true를 반환한다', () => {
    expect(deriveSpaceKidsFriendly({ useTargetInfo: '가족(학부모 1인, 자녀 1인)' })).toBe(true);
    expect(deriveSpaceKidsFriendly({ useTargetInfo: '초등학생 대상' })).toBe(true);
  });

  it('MINCLASSNM이 키즈/체험 전용 시설이면 true를 반환한다', () => {
    expect(deriveSpaceKidsFriendly({ minClassName: '서울형키즈카페' })).toBe(true);
    expect(deriveSpaceKidsFriendly({ minClassName: '농장체험' })).toBe(true);
  });

  it('두 필드 모두 키즈 신호가 없으면(예: 일반 체육관) false를 반환한다 — 오매핑 정화 확인', () => {
    expect(deriveSpaceKidsFriendly({ useTargetInfo: '성인', minClassName: '체육관' })).toBe(false);
  });

  it('필드가 아예 없어도(undefined) 예외 없이 false를 반환한다', () => {
    expect(deriveSpaceKidsFriendly({})).toBe(false);
  });
});
