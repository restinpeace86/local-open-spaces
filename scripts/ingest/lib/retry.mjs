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

// fn: () => Promise<T>. 재시도 가능한 에러만 지수 백오프(기본 2s → 6s → 18s)로 최대 retries회
// 재시도하고, 재시도 불가능한 에러(인증 실패, 유효성 오류 등)는 즉시 그대로 던져 불필요한
// 대기를 만들지 않는다.
export async function withRetry(
  fn,
  { retries = 3, baseDelayMs = 2000, label = '', isRetryable = isRetryableError } = {}
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
      const delay = baseDelayMs * 3 ** attempt;
      console.warn(
        `⚠️  ${label ? `[${label}] ` : ''}일시적 오류로 재시도(${attempt + 1}/${retries}, ${delay}ms 대기 후): ${err.message}`
      );
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  throw lastErr;
}
