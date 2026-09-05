// [지오코딩 안전장치 — 서킷 브레이커](2026-09-05 사용자 지시): "V-World API 호출 시 502
// 에러나 타임아웃이 연속으로 3회 이상 발생하면.. 남은 전체 지오코딩 작업을 즉시 중단(또는
// 해당 건들을 스킵)하고 다음 배치 단계로 빠르게 넘어가게(Fail Fast) 해줘."
//
// 실측으로 확인한 배경: gg-kidscafe-adapter.mjs/gg-events-adapter.mjs/gg-culture-events-
// adapter.mjs/rural-education-farm-adapter.mjs/rural-experience-village-adapter.mjs 5개
// 어댑터가 각자 자기만의 GEOCODE_MAX_ATTEMPTS(3회) 재시도 루프로 vworld-geocoder.mjs의
// geocode()를 감싸고 있는데, geocode() 자신도 내부에서 이미 최대 4회(MAX_RETRIES=3)
// 재시도한다 — 즉 V-World가 완전히 응답 불가 상태가 되면 "재시도 안의 재시도"로 주소
// 하나당 최대 3(외부) × 4(내부) = 12회 연결 시도를 전부 소진할 때까지 멈추지 않는다.
// 사용자가 실제로 신고한 로그(UND_ERR_CONNECT_TIMEOUT, timeout: 10000ms)가 이 패턴과
// 정확히 일치한다 — 배치 하나에 이런 주소가 수십 건이면 여기서만 몇 시간이 소요될 수 있다.
//
// 해결: vworld-geocoder.mjs의 fetchVworld() 안, 실제 네트워크 시도 바로 앞뒤에서 이
// 모듈을 호출한다 — 연결류 에러(retry.mjs의 isRetryableError와 동일 기준: 502/타임아웃/
// ECONNRESET 등, 주소를 못 찾은 정상적인 NOT_FOUND는 제외)가 연속 3회 발생하면 회로를
// "열림"으로 바꾸고, 열려 있는 동안은 실제 네트워크 요청 자체를 시도하지 않고 즉시
// 실패로 간주한다(어댑터의 외부 재시도 루프도, geocode() 내부 재시도 루프도 전부
// 건너뛰게 되어 사실상 즉시 종료된다).
//
// 상태는 모듈 레벨(프로세스 전역)로 둔다 — run-daily.mjs가 여러 어댑터를 같은 Node
// 프로세스 안에서 순차 실행하므로(각자 별도 프로세스로 fork하지 않음), 어느 한 어댑터
// 단계에서 V-World가 다운된 것을 확인하면 그 뒤에 실행되는 다른 어댑터 단계들도 각자
// 처음부터 다시 3번 실패를 겪을 필요 없이 즉시 건너뛴다. 다음 배치 실행(다음 날 cron)은
// 새 프로세스로 시작되므로 회로는 자동으로 "닫힘"으로 리셋된다 — 별도의 쿨다운/half-open
// 상태는 두지 않는다(한 번의 배치 실행 동안은 "복구됐는지 다시 찔러보기"보다 "이번
// 실행에서는 포기하고 다음 실행을 기다리기"가 요구사항의 "Fail Fast" 취지에 더 맞다).
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

let consecutiveFailures = 0;
let isOpen = false;

export function isVworldCircuitOpen() {
  return isOpen;
}

// 연결류 에러(502/타임아웃/소켓 오류 등)일 때만 호출한다 — 진짜 NOT_FOUND(주소를 못 찾음)는
// 서버가 정상 동작 중이라는 뜻이라 실패로 세지 않는다(호출부에서 이미 구분해 호출).
export function recordVworldFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD && !isOpen) {
    isOpen = true;
    console.error(
      `🔴 V-World 지오코딩 서킷 브레이커 OPEN — 연속 ${consecutiveFailures}회 연결 실패로 이번 배치 실행 동안 V-World 호출을 전부 건너뜁니다(카카오 폴백만 시도).`
    );
  }
}

export function recordVworldSuccess() {
  consecutiveFailures = 0;
  // 성공했다는 것은 서버가 복구됐다는 뜻이므로, 혹시 이전에 열려 있었다면 닫아 다시
  // 정상 경로를 쓰게 한다(같은 프로세스 안에서도 일시적 장애 후 복구를 반영할 수 있게).
  if (isOpen) {
    isOpen = false;
    console.log('🟢 V-World 지오코딩 서킷 브레이커 CLOSE — 연결이 복구되어 다시 시도합니다.');
  }
}

// 테스트 전용 — 각 테스트가 모듈 전역 상태에 영향받지 않도록 초기화한다.
export function resetVworldCircuitBreakerForTest() {
  consecutiveFailures = 0;
  isOpen = false;
}
