// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시): `scripts/ingest/lib/
// fetch-with-timeout.mjs`의 경량 TS 버전이다. 인제스트 배치의 원본은 `fetchWithCause`
// (원인 진단 강화)까지 함께 감싸지만, 이 앱의 서버 API 라우트는 실패 시 곧바로 사용자에게
// 보여줄 안내 문구로 치환하는 짧은 호출 1~2곳뿐이라 그 정도의 진단 강화가 필요 없다 —
// AbortController 기반 타임아웃만 남긴 단순화 버전이다(기존 관례처럼 두 런타임 간 import를
// 주고받지 않음, kma-grid.ts 주석 참고).
const DEFAULT_TIMEOUT_MS = 30000;

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  if (options.signal) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`fetch timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
