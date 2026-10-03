import { describe, expect, it } from 'vitest';
import { calculateGrade } from './mom-pick-grade-calc.mjs';

// [Decision 019](2026-09-02): src/lib/community/grades.test.ts와 동일한 케이스를 이
// 독립 mjs 구현에 대해서도 검증해 두 구현이 drift하지 않는지 확인한다.
// [Decision 027 — 열심맘 영구 달성](2026-10-03 사용자 지시: "우수맘 빼고는 그냥 매월
// 안하고 한번만 횟수채워도 되는거 아니야?"): hasReachedActiveLifetime(평생 누적 글
// 2건 이상)만 보고, monthlySpotPhotoReviewCount(우수맘)만 매월 재평가한다.
describe('mom-pick-grade-calc (batch용 독립 구현)', () => {
  it('한 번도 작성한 적 없으면 signed_up', () => {
    expect(
      calculateGrade({ hasEverPosted: false, hasReachedActiveLifetime: false, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('signed_up');
  });

  it('평생 누적 2건 미만이면 sprout', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: false, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('sprout');
  });

  it('평생 누적 2건 이상이면 active — 이번 달 실적 0이어도 유지(핵심 회귀)', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('active');
  });

  it('이번 달 사진 포함 스팟 리뷰가 5곳 이상이면 excellent', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 5, isPowerMomThisMonth: false })
    ).toBe('excellent');
  });

  it('우수맘 조건 미달이면 active로 내려간다(새싹맘까지는 안 내려감)', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 4, isPowerMomThisMonth: false })
    ).toBe('active');
  });

  it('우수맘 조건 + 파워맘 정원 선발이면 power', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 8, isPowerMomThisMonth: true })
    ).toBe('power');
  });
});
