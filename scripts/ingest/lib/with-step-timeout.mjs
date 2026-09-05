// [지오코딩 안전장치 — 전체 스텝 하드 타임아웃](2026-09-05 사용자 지시): "지오코딩 전체
// 프로세스에 하드 타임아웃(예: 최대 몇 분 이상 걸리면 강제 종료 후 에러 로그 남기고
// 진행)을 걸어두어 소켓이 물려 영원히 대기하는 상황을 원천 차단해줘."
//
// vworld-circuit-breaker.mjs가 지오코딩 자체의 hang을 이미 훨씬 빠르게(연속 3회 실패 시
// 즉시) 끊어내지만, 이 워치독은 그와 별개의 방어선이다 — 지오코딩이 아닌 다른 원인으로
// 특정 배치 스텝이 예상외로 오래 걸리거나 멈추더라도, 전체 배치(run-daily.mjs/
// run-monthly.mjs)가 그 한 스텝 때문에 몇 시간씩 멈추지 않고 실패로 기록한 뒤 다음
// 스텝으로 넘어가게 한다.
//
// 주의(정직하게 기록): 이 함수는 진짜 "취소"가 아니라 "포기"다 — Promise.race로 먼저
// 끝나는 쪽을 채택할 뿐, 시간 초과된 원래 Promise(예: 응답 없는 소켓을 기다리는 fetch)를
// 강제로 중단시키지는 못한다(JS에는 실행 중인 Promise를 외부에서 강제 종료하는 표준
// 메커니즘이 없다). 다만 GitHub Actions 잡 자체는 이 스텝의 결과를 기다리지 않고 다음
// 스텝으로 진행하므로, "며칠이고 job이 in_progress로 멈춰 있는" 상황은 방지된다 — job은
// 결국 나머지 스텝을 마치고 정상 종료된다(leaked된 개별 fetch는 Node 프로세스 종료 시
// 함께 정리된다).
export async function withStepTimeout(runStep, { label, timeoutMs }) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `[${label}] 하드 타임아웃(${Math.round(timeoutMs / 1000)}초) 초과 — 응답 없는 요청이 있는 것으로 보여 이 단계를 포기하고 다음 단계로 넘어갑니다.`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([runStep(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}
