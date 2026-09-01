// [배치 수집 안정성 고도화](2026-08-30 사용자 지시): 어댑터들의 원본 API `fetch(url)`
// 호출에 타임아웃이 전혀 걸려있지 않았다(실측 확인 — tour-api-v4-area-based-adapter.mjs
// 등에서 그냥 `await fetch(url)`). Node 내장 fetch(undici)는 애플리케이션 레벨 타임아웃을
// 자체적으로 짧게 걸지 않아, 원본 서버가 응답을 지연시키면 무한정 대기할 수 있다 — 사용자
// 지시대로 30초 이상의 명시적 타임아웃을 AbortController로 건다.
//
// [외부 공공 API 배치 수집 안정성 고도화](2026-09-01 사용자 지시): fetchWithCause(원인
// 진단 강화 — err.cause/AggregateError를 메시지에 풀어냄, 2026-08-30 파이프라인 장애
// 점검에서 도입)와 이 타임아웃 래퍼가 서로 다른 파일에 따로 있어 호출부가 매번 둘 중
// 하나만 쓰고 있었다 — 이제 fetchWithTimeout이 내부적으로 fetchWithCause를 거쳐 실제
// fetch를 호출해서, 이 함수 하나만 써도 타임아웃과 원인 진단을 동시에 얻는다(기존에
// fetchWithCause만 쓰던 호출부를 이걸로 교체하면 하위 호환 — 옵션/반환값 동일).
import { fetchWithCause } from './fetch-with-cause.mjs';

const DEFAULT_TIMEOUT_MS = 30000;

// url/options는 전역 fetch와 동일하게 받는다. timeoutMs만 별도로 받아 AbortController의
// signal을 options.signal에 주입한다(호출부가 이미 signal을 넘긴 경우는 그대로 존중해
// 이중으로 걸지 않는다).
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (options.signal) {
    return fetchWithCause(url, options);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchWithCause(url, { ...options, signal: controller.signal });
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
