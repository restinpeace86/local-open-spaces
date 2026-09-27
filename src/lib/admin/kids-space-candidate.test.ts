import { describe, expect, it } from 'vitest';
import { isKidsSpaceReviewCandidate } from './kids-space-candidate';

// [공간 문제 해결 후보 검토 표시](2026-09-27 사용자 지시) — 채팅 SQL 분석에서
// 확정한 규칙을 그대로 코드화했는지 검증한다.
describe('isKidsSpaceReviewCandidate', () => {
  it('주택단지/학교는 이름이 매칭돼도 항상 후보가 아니다', () => {
    expect(isKidsSpaceReviewCandidate('한마음아파트 어린이놀이터', '주택단지')).toBe(false);
    expect(isKidsSpaceReviewCandidate('OO초등학교 생태체험학습장', '학교')).toBe(false);
  });

  it('이미 분류된 키즈/놀이시설 3종은 항상 후보가 아니다', () => {
    expect(isKidsSpaceReviewCandidate('OO키즈카페', '키즈카페')).toBe(false);
    expect(isKidsSpaceReviewCandidate('OO놀이방식당', '놀이방식당')).toBe(false);
    expect(isKidsSpaceReviewCandidate('OO찜질방', '놀이방찜질방/스파')).toBe(false);
  });

  it('체육시설은 수영장 외 중분류는 이름이 매칭돼도 후보가 아니다', () => {
    expect(isKidsSpaceReviewCandidate('어린이 테니스장', '테니스장')).toBe(false);
    expect(isKidsSpaceReviewCandidate('유아 골프장', '골프장')).toBe(false);
  });

  it('수영장은 일반 규칙(포함/제외 키워드)을 그대로 적용한다', () => {
    expect(isKidsSpaceReviewCandidate('어린이 수영장', '수영장')).toBe(true);
    expect(isKidsSpaceReviewCandidate('시립 종합 수영장', '수영장')).toBe(false);
  });

  it('공원은 "어린이/유아"가 아니라 테마 키워드로만 판정한다', () => {
    expect(isKidsSpaceReviewCandidate('새싹어린이공원', '공원')).toBe(false);
    expect(isKidsSpaceReviewCandidate('개나리공원 어린이놀이터', '공원')).toBe(false);
    expect(isKidsSpaceReviewCandidate('가원습지생태공원', '공원')).toBe(true);
    expect(isKidsSpaceReviewCandidate('관악산 모험숲놀이터', '공원')).toBe(true);
    expect(isKidsSpaceReviewCandidate('서울형 키즈카페 도봉구 창1동점', '공원')).toBe(true);
  });

  it('그 외 중분류는 포함 키워드가 있어도 제외 키워드가 있으면 후보가 아니다', () => {
    expect(isKidsSpaceReviewCandidate('행복 어린이집', '기타')).toBe(false);
    expect(isKidsSpaceReviewCandidate('무지개 유치원', '아동복지시설')).toBe(false);
  });

  it('그 외 중분류는 포함 키워드만 있으면 후보다', () => {
    expect(isKidsSpaceReviewCandidate('시립 과학관', '종합/기타박물관')).toBe(true);
    expect(isKidsSpaceReviewCandidate('OO 어린이 도서관', '도서관')).toBe(true);
  });

  it('category_min이 null이면 기본 규칙(포함/제외 키워드)을 적용한다', () => {
    expect(isKidsSpaceReviewCandidate('상상어린이체험관', null)).toBe(true);
    expect(isKidsSpaceReviewCandidate('평범한 시설', null)).toBe(false);
  });
});
