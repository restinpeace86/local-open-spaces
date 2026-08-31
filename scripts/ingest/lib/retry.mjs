// [수집 파이프라인 자동 재시도 메커니즘](2026-08-28): API 호출 일시 타임아웃, 네트워크
// 불안정, DB 부하 등 "일시적" 실패 한 번으로 당일 데이터 전체가 유실되지 않도록 도입한다.
// 4xx 인증/요청 오류 같은 영구적 실패까지 재시도하면 API 호출 한도만 낭비하고 결과도
// 바뀌지 않으므로, 네트워크/타임아웃 계열로 확인되는 에러 메시지만 재시도 대상으로 판별한다.
const RETRYABLE_MESSAGE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /EAI_AGAIN/,
  /fetch failed/i,
  /network/i,
  /socket hang up/i,
  /statement timeout/i,
  /too many connections/i,
  /service unavailable/i,
  /50[023]/, // 502/503 Bad Gateway/Service Unavailable 등 HTTP 상태 코드가 메시지에 포함되는 경우
];

export function isRetryableError(err) {
  const message = err?.message ?? String(err);
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// fn: () => Promise<T>. 재시도 가능한 에러만 지수 백오프로 최대 retries회 재시도하고,
// 재시도 불가능한 에러(인증 실패, 유효성 오류 등)는 즉시 그대로 던져 불필요한 대기를
// 만들지 않는다.
//
// [배치 수집 안정성 고도화](2026-08-30 사용자 지시): 기존 기본값(2s → 6s → 18s, ×3배)을
// 사용자가 예시로 명시한 "1차 실패 후 5초, 2차 실패 후 10초"(×2배)에 맞춰 baseDelayMs=5000/
// 배수 2로 조정한다 — retries는 "총 3회까지 재시도"라는 문구를 그대로 살려 3을 유지한다
// (초기 시도 1회 + 재시도 3회 = 총 4회 시도, 지연 시간은 5s→10s→20s로 이어짐. "총 3회까지
// 재시도"와 "1차 5초/2차 10초" 두 표현이 정확히 일치하진 않지만, 재시도 횟수는 문구
// 그대로, 지연 시간은 예시로 준 두 값 그대로 반영하는 쪽으로 판단했다 — 추측 최소화).
export async function withRetry(
  fn,
  { retries = 3, baseDelayMs = 5000, backoffMultiplier = 2, label = '', isRetryable = isRetryableError } = {}
) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) {
        throw err;
      }
      const delay = baseDelayMs * backoffMultiplier ** attempt;
      console.warn(
        `⚠️  ${label ? `[${label}] ` : ''}일시적 오류로 재시도(${attempt + 1}/${retries}, ${delay}ms 대기 후): ${err.message}`
      );
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  throw lastErr;
}
