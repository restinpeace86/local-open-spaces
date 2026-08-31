// [배치 수집 안정성 고도화](2026-08-30 사용자 지시): 어댑터들의 원본 API `fetch(url)`
// 호출에 타임아웃이 전혀 걸려있지 않았다(실측 확인 — tour-api-v4-area-based-adapter.mjs
// 등에서 그냥 `await fetch(url)`). Node 내장 fetch(undici)는 애플리케이션 레벨 타임아웃을
// 자체적으로 짧게 걸지 않아, 원본 서버가 응답을 지연시키면 무한정 대기할 수 있다 — 사용자
// 지시대로 30초 이상의 명시적 타임아웃을 AbortController로 건다.
const DEFAULT_TIMEOUT_MS = 30000;

// url/options는 전역 fetch와 동일하게 받는다. timeoutMs만 별도로 받아 AbortController의
// signal을 options.signal에 주입한다(호출부가 이미 signal을 넘긴 경우는 그대로 존중해
// 이중으로 걸지 않는다).
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (options.signal) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      // "timeout"이라는 영문 단어를 메시지에 그대로 포함시켜야 retry.mjs의
      // isRetryableError(/timeout/i)가 재시도 대상으로 정확히 인식한다.
      throw new Error(`fetch timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
