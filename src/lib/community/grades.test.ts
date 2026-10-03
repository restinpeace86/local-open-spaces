import { describe, expect, it } from 'vitest';
import {
  calculateGrade,
  canAccessCommunityFeed,
  canBookmark,
  canReceivePushNotifications,
  canSeeLikeReactions,
  canUseUnlimitedChatbot,
  hasFeedPriorityBadge,
  hasReachedGrade,
  hasSpotlightBadge,
} from './grades';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 등급 산정과 등급별
// 권한 게이트를 검증한다.
// [Decision 027 — 열심맘 영구 달성](2026-10-03 사용자 지시: "우수맘 빼고는 그냥 매월
// 안하고 한번만 횟수채워도 되는거 아니야?"): 새싹맘처럼 열심맘도 평생 누적 2건
// 작성이면 영구 달성(hasReachedActiveLifetime)으로 바뀌었다 — 이번 달 실적이 0이어도
// 강등되지 않는다. 우수맘/파워맘(월 5개 스팟 사진 리뷰, monthlySpotPhotoReviewCount)만
// 매월 재평가해 강등될 수 있다.
describe('calculateGrade', () => {
  it('한 번도 작성한 적 없으면 signed_up (새싹맘 미달성)', () => {
    expect(
      calculateGrade({ hasEverPosted: false, hasReachedActiveLifetime: false, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('signed_up');
  });

  it('평생 누적 2건 미만이고 이번 달 실적도 없으면 sprout', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: false, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('sprout');
  });

  it('평생 누적 2건 이상이면 active(열심맘) — 이번 달 실적이 0이어도 유지된다(핵심 회귀 테스트)', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('active');
  });

  it('지난달에 5건을 썼어도 이번 달 0건이면 — 평생 누적 2건 이상이라 여전히 active(새싹맘으로 강등 안 됨)', () => {
    // 실제 버그 리포트 재현: "내가 쓴 후기가 총 5건인데 왜 새싹맘이지?" — 5건이 전부
    // 지난달이라 월별 기준이면 새싹맘으로 보였던 문제. 이제 평생 누적만 보므로 active.
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 0, isPowerMomThisMonth: false })
    ).toBe('active');
  });

  it('이번 달 사진 포함 스팟 리뷰가 5곳 이상이면 excellent(우수맘)', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 5, isPowerMomThisMonth: false })
    ).toBe('excellent');
  });

  it('우수맘 조건(사진 포함 스팟 리뷰 5곳) 미달이면 열심맘으로 내려가되, 새싹맘까지는 안 내려간다', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 4, isPowerMomThisMonth: false })
    ).toBe('active');
  });

  it('우수맘 조건을 만족하면서 이번 달 파워맘 정원에 선발되면 power', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 7, isPowerMomThisMonth: true })
    ).toBe('power');
  });

  it('파워맘 정원 선발이어도 우수맘 조건(사진 포함 스팟 리뷰 5곳) 미만이면 power가 아니다', () => {
    expect(
      calculateGrade({ hasEverPosted: true, hasReachedActiveLifetime: true, monthlySpotPhotoReviewCount: 3, isPowerMomThisMonth: true })
    ).toBe('active');
  });
});

describe('hasReachedGrade / 등급 게이트', () => {
  it('비로그인(null/undefined)은 어떤 등급 요건도 충족하지 못한다', () => {
    expect(hasReachedGrade(null, 'sprout')).toBe(false);
    expect(canAccessCommunityFeed(undefined)).toBe(false);
    expect(canUseUnlimitedChatbot(null)).toBe(false);
  });

  it('signed_up(로그인만 함)은 비로그인과 동일하게 커뮤니티/챗봇 무제한 미충족', () => {
    expect(canAccessCommunityFeed('signed_up')).toBe(false);
    expect(canUseUnlimitedChatbot('signed_up')).toBe(false);
  });

  it('sprout(새싹맘) 이상은 커뮤니티 피드/챗봇 무제한 이용 가능', () => {
    expect(canAccessCommunityFeed('sprout')).toBe(true);
    expect(canUseUnlimitedChatbot('sprout')).toBe(true);
    // 아직 찜/좋아요 확인/푸시/뱃지는 불가
    expect(canBookmark('sprout')).toBe(false);
    expect(canSeeLikeReactions('sprout')).toBe(false);
    expect(canReceivePushNotifications('sprout')).toBe(false);
  });

  it('active(열심맘) 이상은 찜/좋아요 반응 확인 가능', () => {
    expect(canBookmark('active')).toBe(true);
    expect(canSeeLikeReactions('active')).toBe(true);
    expect(canReceivePushNotifications('active')).toBe(false);
  });

  it('excellent(우수맘) 이상은 푸시 알림/피드 우선노출 뱃지 가능', () => {
    expect(canReceivePushNotifications('excellent')).toBe(true);
    expect(hasFeedPriorityBadge('excellent')).toBe(true);
    expect(hasSpotlightBadge('excellent')).toBe(false);
  });

  it('power(파워맘)만 스포트라이트 뱃지 가능', () => {
    expect(hasSpotlightBadge('power')).toBe(true);
  });
});
