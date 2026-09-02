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

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 등급 산정(달력월 기준,
// 즉시 강등)과 등급별 권한 게이트를 검증한다.
describe('calculateGrade', () => {
  it('한 번도 작성한 적 없으면 signed_up (새싹맘 미달성)', () => {
    expect(calculateGrade({ hasEverPosted: false, monthlyPostCount: 0, isPowerMomThisMonth: false })).toBe('signed_up');
  });

  it('평생 1회 이상 작성했지만 이번 달 실적이 없으면 sprout로 즉시 강등(유예 없음)', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 0, isPowerMomThisMonth: false })).toBe('sprout');
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 1, isPowerMomThisMonth: false })).toBe('sprout');
  });

  it('이번 달 2건 이상이면 active(열심맘)', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 2, isPowerMomThisMonth: false })).toBe('active');
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 4, isPowerMomThisMonth: false })).toBe('active');
  });

  it('이번 달 5건 이상이면 excellent(우수맘)', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 5, isPowerMomThisMonth: false })).toBe('excellent');
  });

  it('우수맘 조건을 만족하면서 이번 달 파워맘 정원에 선발되면 power', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 7, isPowerMomThisMonth: true })).toBe('power');
  });

  it('파워맘 정원 선발이어도 우수맘 조건(5건) 미만이면 power가 아니다', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 3, isPowerMomThisMonth: true })).toBe('active');
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
