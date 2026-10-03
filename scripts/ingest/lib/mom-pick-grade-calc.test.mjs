import { describe, expect, it } from 'vitest';
import { calculateGrade } from './mom-pick-grade-calc.mjs';

// [Decision 019](2026-09-02): src/lib/community/grades.test.ts와 동일한 케이스를 이
// 독립 mjs 구현에 대해서도 검증해 두 구현이 drift하지 않는지 확인한다.
// [Decision 019 개정 — 우수맘 조건](2026-10-03 사용자 지시: "월 5개 스팟 리뷰(이미지
// 포함)인거야"): 우수맘은 monthlySpotPhotoReviewCount(사진 포함 리뷰를 작성한 서로
// 다른 스팟 수) 기준으로 바뀌었다.
describe('mom-pick-grade-calc (batch용 독립 구현)', () => {
  it('한 번도 작성한 적 없으면 signed_up', () => {
    expect(
      calculateGrade({ hasEverPosted: false, monthlyPostCount: 0, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('signed_up');
  });

  it('평생 1회 이상이지만 이번 달 실적 0이면 sprout로 즉시 강등', () => {
    expect(
      calculateGrade({ hasEverPosted: true, monthlyPostCount: 0, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('sprout');
  });

  it('이번 달 글 2건 이상이면 active', () => {
    expect(
      calculateGrade({ hasEverPosted: true, monthlyPostCount: 2, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('active');
  });

  it('이번 달 사진 포함 스팟 리뷰가 5곳 이상이면 excellent', () => {
    expect(
      calculateGrade({ hasEverPosted: true, monthlyPostCount: 5, monthlySpotPhotoReviewCount: 5, isPowerMomThisMonth: false })
    ).toBe('excellent');
  });

  it('글은 많이 썼어도 사진 포함 스팟 리뷰가 5곳 미만이면 excellent가 아니다', () => {
    expect(
      calculateGrade({ hasEverPosted: true, monthlyPostCount: 20, monthlySpotPhotoReviewCount: 4, isPowerMomThisMonth: false })
    ).toBe('active');
  });

  it('우수맘 조건 + 파워맘 정원 선발이면 power', () => {
    expect(
      calculateGrade({ hasEverPosted: true, monthlyPostCount: 8, monthlySpotPhotoReviewCount: 8, isPowerMomThisMonth: true })
    ).toBe('power');
  });
});
