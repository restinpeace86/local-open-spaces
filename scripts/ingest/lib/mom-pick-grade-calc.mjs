// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 등급 산정 순수 함수.
// src/lib/community/grades.ts의 calculateGrade()와 동일한 규칙이다 — 이 프로젝트의 배치
// 스크립트(scripts/)는 TypeScript 빌드 파이프라인 없이 순수 Node ESM으로 직접 실행되어
// `@/` 별칭으로 src/ 코드를 가져올 수 없다(기존 모든 배치 스크립트가 동일한 이유로
// 독립 구현이다). 등급 규칙을 바꿀 때는 두 파일을 함께 수정해야 한다(양쪽 다 소규모
// 순수 함수라 drift 위험은 낮다 — grades.test.ts가 TS 쪽 회귀를 잡아준다).
export function calculateGrade({ hasEverPosted, monthlyPostCount, isPowerMomThisMonth }) {
  if (!hasEverPosted) return 'signed_up';
  if (monthlyPostCount >= 5) return isPowerMomThisMonth ? 'power' : 'excellent';
  if (monthlyPostCount >= 2) return 'active';
  return 'sprout';
}
