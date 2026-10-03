// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 등급 산정 순수 함수.
// src/lib/community/grades.ts의 calculateGrade()와 동일한 규칙이다 — 이 프로젝트의 배치
// 스크립트(scripts/)는 TypeScript 빌드 파이프라인 없이 순수 Node ESM으로 직접 실행되어
// `@/` 별칭으로 src/ 코드를 가져올 수 없다(기존 모든 배치 스크립트가 동일한 이유로
// 독립 구현이다). 등급 규칙을 바꿀 때는 두 파일을 함께 수정해야 한다(양쪽 다 소규모
// 순수 함수라 drift 위험은 낮다 — grades.test.ts가 TS 쪽 회귀를 잡아준다).
//
// [Decision 027 — 열심맘을 평생 1회성 달성으로 변경](2026-10-03 사용자 지시): "우수맘
// 빼고는 그냥 매월 안하고 한번만 횟수채워도 되는거 아니야?" — 새싹맘처럼 열심맘도
// 평생 누적 2건 작성이면 영구 달성(매월 재충족 불필요)으로 바뀌었다.
// hasReachedActiveLifetime(평생 누적 글 수 >= 2)만 보고, monthlySpotPhotoReviewCount
// (우수맘, 월 5개 스팟 사진 리뷰)만 계속 매월 재평가해 강등될 수 있다.
export function calculateGrade({ hasEverPosted, hasReachedActiveLifetime, monthlySpotPhotoReviewCount, isPowerMomThisMonth }) {
  if (!hasEverPosted) return 'signed_up';
  if (monthlySpotPhotoReviewCount >= 5) return isPowerMomThisMonth ? 'power' : 'excellent';
  if (hasReachedActiveLifetime) return 'active';
  return 'sprout';
}
