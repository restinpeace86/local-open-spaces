// [핵심 events 수집 파이프라인 장애 점검 후속](2026-08-30): 2026-08-30 10:xx UTC 실제
// GitHub Actions 실행에서 GG_CULTURE_EVENTS/TOUR_API_FESTIVAL이 매번 "fetch failed"로만
// 실패했다(docs/pipeline-log.md 실측 확인, 로컬에서는 동일 코드로 재현되지 않음). Node의
// 네이티브 fetch(undici)는 네트워크 계층 실패 시 항상 이 동일한 문구의 TypeError만 던지고,
// 실제 원인(DNS 조회 실패/연결 거부/타임아웃/TLS 오류 등)은 err.cause에만 담는다 — 기존
// 코드는 err.message만 pipeline-log.md에 남겨 이 원인을 전혀 특정할 수 없었다. 다음 실패
// 부터는 cause를 메시지에 포함해 다시 던져 즉시 원인이 드러나게 한다(retry.mjs의
// isRetryableError는 부분 문자열 매칭이라 "fetch failed"가 메시지 어디에 있든 계속
// 재시도 대상으로 인식된다 — 재시도 동작에는 영향 없음).
export async function fetchWithCause(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err instanceof TypeError && err.cause) {
      const causeMessage = err.cause instanceof Error ? err.cause.message : String(err.cause);
      const enriched = new Error(`${err.message} (원인: ${causeMessage})`);
      enriched.cause = err.cause;
      throw enriched;
    }
    throw err;
  }
}
