// [파이프라인 로그 DB화](2026-09-15 사용자 지시, implementation/todo.md [개선사항 3]):
// 이 파일은 원래 recordPipelineRun()으로 docs/pipeline-log.md에 개별 어댑터 실행 결과를
// 직접 기록했다. 배치 오케스트레이터(run-daily.mjs/run-monthly.mjs)가 모든 소스(원본
// 수집 + 후처리 단계 전부)의 결과를 이미 한 곳(results 배열)에 모아 batch-log.mjs의
// recordBatchRun()으로 pipeline_logs 테이블에 기록하므로(같은 실행을 가리키는 이중 기록을
// 막기 위해 단일 창구로 통합), recordPipelineRun()은 제거했다 — countRawItems()만 여전히
// base-collector-adapter.mjs가 raw 수신 건수 집계에 쓰고 있어 이 파일에 남긴다.

// 원본 fetch() 반환값 형태가 어댑터마다 다르다(대부분 배열, gg-culture-events-adapter.mjs처럼
// { cultureEventItems, foundationEventItems } 같은 배열 묶음 객체도 있음) — 두 형태 모두에서
// "원본 수신 건수"를 뽑아 최종 유효 행 수와 비교해 파싱/스킵 에러 건수를 추정한다.
export function countRawItems(raw) {
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === 'object') {
    return Object.values(raw).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
  }
  return null;
}
