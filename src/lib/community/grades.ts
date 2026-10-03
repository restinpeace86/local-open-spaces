// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 맘스픽 5단계 등급 체계와
// 등급별 권한 게이팅 규칙. 'signed_up'(로그인은 했지만 새싹맘 조건 — 첫 후기/체크리스트
// 1회 — 를 아직 채우지 못한 상태)은 기능 게이팅상 비로그인(Visitor)과 동일하게 취급한다
// (표 1절 원문: "새싹맘 달성 조건 = 소셜 로그인 + 첫 스팟 방문 후기 또는 체크리스트 1회
// 작성" — 로그인만으로는 아직 새싹맘이 아니다).
export type MomPickGrade = 'signed_up' | 'sprout' | 'active' | 'excellent' | 'power';

export const GRADE_RANK: Record<MomPickGrade, number> = {
  signed_up: 0,
  sprout: 1,
  active: 2,
  excellent: 3,
  power: 4,
};

export const GRADE_LABEL: Record<MomPickGrade, string> = {
  signed_up: '가입맘',
  sprout: '🌱 새싹맘',
  active: '🌿 열심맘',
  excellent: '🌳 우수맘',
  power: '✨ 파워맘',
};

// null/undefined(비로그인 Visitor)은 signed_up보다도 낮은 등수로 취급한다.
function rankOf(grade: MomPickGrade | null | undefined): number {
  return grade ? GRADE_RANK[grade] : -1;
}

export function hasReachedGrade(grade: MomPickGrade | null | undefined, minGrade: MomPickGrade): boolean {
  return rankOf(grade) >= GRADE_RANK[minGrade];
}

// 등급별 권한 게이트 (spec/community/mom-pick-grades.md 1절 표 그대로)
export const canAccessCommunityFeed = (grade: MomPickGrade | null | undefined) => hasReachedGrade(grade, 'sprout');
export const canUseUnlimitedChatbot = (grade: MomPickGrade | null | undefined) => hasReachedGrade(grade, 'sprout');
export const canBookmark = (grade: MomPickGrade | null | undefined) => hasReachedGrade(grade, 'active');
export const canSeeLikeReactions = (grade: MomPickGrade | null | undefined) => hasReachedGrade(grade, 'active');
export const canReceivePushNotifications = (grade: MomPickGrade | null | undefined) => hasReachedGrade(grade, 'excellent');
export const hasFeedPriorityBadge = (grade: MomPickGrade | null | undefined) => hasReachedGrade(grade, 'excellent');
export const hasSpotlightBadge = (grade: MomPickGrade | null | undefined) => hasReachedGrade(grade, 'power');

// AI 챗봇 무료 체험 한도(비로그인 및 signed_up 공통) — Decision 019: "비로그인 시 1회 한정".
export const FREE_CHATBOT_USES_BEFORE_SPROUT = 1;

export type GradeCalcInput = {
  /** 평생 누적: 후기/체크리스트를 한 번이라도 작성한 적이 있는지(새싹맘 승급은 1회성, 강등되지 않음) */
  hasEverPosted: boolean;
  /** [Decision 027 개정](2026-10-03 사용자 지시): "우수맘 빼고는 그냥 매월 안하고
   * 한번만 횟수채워도 되는거 아니야?" — 열심맘도 새싹맘처럼 평생 누적 2건 작성이면
   * 영구 달성(매월 재충족 불필요, 강등 없음)으로 바뀌었다. 평생 누적 글 수가 2건
   * 이상인지만 본다(월 기준 아님).
   */
  hasReachedActiveLifetime: boolean;
  /** [Decision 019 개정 — 우수맘 조건](2026-10-03 사용자 지시): "월 5개 스팟 리뷰
   * (이미지 포함)인거야" — 글 건수가 아니라 "사진이 포함된 리뷰를 작성한 서로 다른
   * 스팟 수"(이번 달, 중복 스팟은 1개로만 집계). 우수맘(5개 이상) 판정 기준 — 이것만
   * 매월 재평가한다(유일하게 강등 가능한 등급). */
  monthlySpotPhotoReviewCount: number;
  /** 이번 달 파워맘 정원(N명) 선발 대상으로 뽑혔는지 — 우수맘 조건을 만족하는 사람 중에서만 의미 있음 */
  isPowerMomThisMonth: boolean;
};

// [Decision 027](2026-10-03): 새싹맘(평생 1회)·열심맘(평생 누적 2건)은 한 번 달성하면
// 영구 유지되고, 우수맘/파워맘(월 5개 스팟 사진 리뷰)만 달력월 기준으로 매일 재평가해
// 강등될 수 있다(제5장 — "지난달 열심히 썼는데 이번 달 1일부터 새싹맘으로 보인다"는
// 실제 사용자 경험 문제를 고치기 위한 개정, Decision 019의 "즉시 강등, 유예 없음"
// 원칙은 우수맘/파워맘에만 남는다).
export function calculateGrade({
  hasEverPosted,
  hasReachedActiveLifetime,
  monthlySpotPhotoReviewCount,
  isPowerMomThisMonth,
}: GradeCalcInput): MomPickGrade {
  if (!hasEverPosted) return 'signed_up';
  if (monthlySpotPhotoReviewCount >= 5) return isPowerMomThisMonth ? 'power' : 'excellent';
  if (hasReachedActiveLifetime) return 'active';
  return 'sprout';
}
