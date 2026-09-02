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
  /** 이번 달(달력월) 누적 작성 건수 — 열심맘(2건)/우수맘(5건) 판정 기준 */
  monthlyPostCount: number;
  /** 이번 달 파워맘 정원(N명) 선발 대상으로 뽑혔는지 — 우수맘 조건을 만족하는 사람 중에서만 의미 있음 */
  isPowerMomThisMonth: boolean;
};

// 달력월 기준 등급 재계산(Decision 019: 즉시 강등, 당월 실적만 반영, 유예 없음).
export function calculateGrade({ hasEverPosted, monthlyPostCount, isPowerMomThisMonth }: GradeCalcInput): MomPickGrade {
  if (!hasEverPosted) return 'signed_up';
  if (monthlyPostCount >= 5) return isPowerMomThisMonth ? 'power' : 'excellent';
  if (monthlyPostCount >= 2) return 'active';
  return 'sprout';
}
