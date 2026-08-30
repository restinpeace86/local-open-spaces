// [핵심 events 수집 파이프라인 장애 점검 후속](2026-08-30): 2026-08-30 10:xx UTC 실제
// GitHub Actions 실행에서 GG_CULTURE_EVENTS/TOUR_API_FESTIVAL이 매번 "fetch failed"로만
// 실패했다(docs/pipeline-log.md 실측 확인, 로컬에서는 동일 코드로 재현되지 않음). Node의
// 네이티브 fetch(undici)는 네트워크 계층 실패 시 항상 이 동일한 문구의 TypeError만 던지고,
// 실제 원인(DNS 조회 실패/연결 거부/타임아웃/TLS 오류 등)은 err.cause에만 담는다 — 기존
// 코드는 err.message만 pipeline-log.md에 남겨 이 원인을 전혀 특정할 수 없었다. 다음 실패
// 부터는 cause를 메시지에 포함해 다시 던져 즉시 원인이 드러나게 한다(retry.mjs의
// isRetryableError는 부분 문자열 매칭이라 "fetch failed"가 메시지 어디에 있든 계속
// 재시도 대상으로 인식된다 — 재시도 동작에는 영향 없음).
//
// [후속 실측](2026-08-30, 최초 배포 후 실제 재발): 이 감싸기를 배포한 뒤에도 GG_CULTURE_EVENTS가
// 여전히 순수 "fetch failed"만 남기고 err.cause 관련 부가 정보가 전혀 붙지 않았다 —
// 즉 이 환경(GitHub Actions 러너)의 undici가 이 특정 실패에는 애초에 err.cause를 붙이지
// 않는다는 뜻이다(로컬 재현 불가와 함께, 네트워크/방화벽/IP 차단 계열일 가능성에 더
// 무게가 실림 — JS 에러 객체 조사만으로는 더 캘 정보가 없다). describeError()는 cause뿐
// 아니라 err 자체의 code/errno, AggregateError의 하위 에러 목록까지 방어적으로
// 긁어모아 "혹시라도" 담겨 있는 정보는 놓치지 않도록 한다 — 그래도 아무 것도 없으면
// (이번처럼) 원본 메시지를 그대로 둔다. 커넥션 레벨(TLS/TCP/DNS)에서 무슨 일이 있었는지는
// JS fetch 에러만으로 알 수 없는 한계가 있어, 별도로 ingest-daily.yml에 curl -v 진단
// 스텝을 추가해 워크플로 로그에서 직접 확인하도록 했다.
function describeError(err) {
  if (err === null || err === undefined) return null;
  if (typeof err !== 'object') return String(err);

  // AggregateError(예: 여러 DNS 후보 IP가 전부 실패) — 개별 실패 원인을 전부 펼쳐 보인다.
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors.map((e) => describeError(e) ?? String(e)).join(' | ');
  }
  if (err.message) return err.code ? `${err.code}: ${err.message}` : err.message;
  if (err.code) return err.code;
  if (err.errno) return `errno ${err.errno}`;
  return null;
}

export async function fetchWithCause(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const detail = describeError(err.cause) ?? (err.code || err.errno ? describeError(err) : null);

    if (detail) {
      const enriched = new Error(`${err.message} (원인: ${detail})`);
      enriched.cause = err.cause ?? err;
      throw enriched;
    }
    throw err;
  }
}
