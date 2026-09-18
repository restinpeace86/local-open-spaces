// Decision 017(2026-08-25) 9항 검증: 체육/공간시설의 키즈 뱃지는 USETGTINFO/MINCLASSNM
// 두 필드로만 판별해야 하고, deriveParentalTags처럼 원본 전체를 넓게 스캔해서는 안 된다.
import { describe, expect, it } from 'vitest';
import { deriveSpaceKidsFriendly, deriveParentalTags } from './ai-tagging.mjs';

// [2026-09-19 사용자 지시] "default를 복합으로 한 게 잘못된거야.. unknown 혹은 null로
// 놔야돼 실내인지 야외인지 혹은 복합인지 판단이 안되면" — 이 함수가 facility_type을
// 산출하는 가장 널리 쓰이는 경로다(여러 어댑터가 broadTags.facility_type으로 그대로
// 사용). 이전엔 "실내외 키워드가 둘 다 있거나 둘 다 없음"을 전부 '복합'으로
// 뭉뚱그렸는데, 이제 '복합'은 실제로 둘 다 확인됐을 때만, 근거가 없으면 null이다.
describe('deriveParentalTags — facility_type', () => {
  it('실내 키워드만 있으면 실내다', () => {
    expect(deriveParentalTags('실내 체육관에서 진행합니다').facility_type).toBe('실내');
  });

  it('야외 키워드만 있으면 야외다', () => {
    expect(deriveParentalTags('공원에서 진행하는 야외 프로그램').facility_type).toBe('야외');
  });

  it('실내외 키워드가 둘 다 있으면 복합이다(실제로 확인된 경우만)', () => {
    expect(deriveParentalTags('실내 전시관과 야외 광장을 함께 이용').facility_type).toBe('복합');
  });

  it('실내외 키워드가 전혀 없으면 null이다(더 이상 복합으로 단정하지 않음)', () => {
    expect(deriveParentalTags('아이와 함께하는 즐거운 체험').facility_type).toBeNull();
    expect(deriveParentalTags('').facility_type).toBeNull();
  });
});

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
