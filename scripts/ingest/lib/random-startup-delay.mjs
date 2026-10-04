// [배치 시작 시 랜덤 지연](2026-10-04 사용자 지시): "배치 시작시 자체적으로
// 랜덤 지연을 주는 방법 적용해" — GitHub Actions의 cron 트리거 자체는 고정
// 시각(예: 매시 7분)이라 그 트리거 시각만 보면 여전히 규칙적이지만, 실제로
// 롯데마트 서버에 요청이 처음 도달하는 시각을 배치 자신이 추가로 흔들어서
// "트리거는 규칙적이어도 실제 트래픽 패턴은 매번 달라지게" 만든다 —
// "매시 7분도 기계적인거 아닌가"라는 지적에 대한 대응.
export function randomStartupDelayMs(maxMs) {
  if (!Number.isFinite(maxMs) || maxMs <= 0) return 0;
  return Math.random() * maxMs;
}

// log는 호출부가 쓰는 콘솔 함수를 그대로 주입받는다(테스트에서 조용히 만들기
// 쉽게, 그리고 각 배치가 이미 쓰고 있는 로그 스타일을 그대로 따르게 하기 위함).
export async function applyRandomStartupDelay(maxMs, { log = console.log } = {}) {
  const delayMs = randomStartupDelayMs(maxMs);
  if (delayMs > 0) {
    log(`⏳ 랜덤 시작 지연 ${(delayMs / 1000).toFixed(1)}초...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return delayMs;
}
