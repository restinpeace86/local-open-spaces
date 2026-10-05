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

// [수동 실행은 지연 생략](2026-10-05 사용자 지적): "랜덤시작 지연.. 엄청
// 오래걸리네" — workflow_dispatch로 수동 트리거해서 방금 고친 게 실제로
// 됐는지 바로 확인하고 싶을 때, 최대 10분 지연은 디버깅을 느리게 만들
// 뿐이다. GitHub Actions는 스케줄(cron)로 실행될 때만 GITHUB_EVENT_NAME을
// 'schedule'로 채운다 — 수동 트리거(workflow_dispatch)와 로컬 실행 둘 다
// 이 값이 'schedule'이 아니므로(로컬은 아예 설정 자체가 없음), "진짜 예약
// 실행일 때만" 지연을 건다. 봇처럼 안 보이려는 목적(기계적 트리거 시각을
// 흔드는 것)은 스케줄 실행에만 의미가 있으므로 이 구분이 취지에도 맞는다.
function isScheduledRun() {
  return process.env.GITHUB_EVENT_NAME === 'schedule';
}

// log는 호출부가 쓰는 콘솔 함수를 그대로 주입받는다(테스트에서 조용히 만들기
// 쉽게, 그리고 각 배치가 이미 쓰고 있는 로그 스타일을 그대로 따르게 하기 위함).
export async function applyRandomStartupDelay(maxMs, { log = console.log } = {}) {
  if (!isScheduledRun()) {
    log('⏳ 예약 실행(schedule)이 아니라 랜덤 시작 지연을 생략합니다(수동 트리거/로컬 실행).');
    return 0;
  }

  const delayMs = randomStartupDelayMs(maxMs);
  if (delayMs > 0) {
    log(`⏳ 랜덤 시작 지연 ${(delayMs / 1000).toFixed(1)}초...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return delayMs;
}
