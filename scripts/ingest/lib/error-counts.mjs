// [배치 안정성 진단](2026-09-18 사용자 지시, implementation/todo.md 개선사항 2): 원래
// seoul-yeyak-adapter.mjs 안에서만 쓰이던 원인별 에러 집계 헬퍼를 공용 모듈로 뽑아냈다
// (제5장 제4조 — 두 번째 어댑터가 필요해진 시점에 세 번째 복제를 만들지 않고 공유한다).
export function bumpError(errorCounts, type) {
  errorCounts[type] = (errorCounts[type] || 0) + 1;
}
