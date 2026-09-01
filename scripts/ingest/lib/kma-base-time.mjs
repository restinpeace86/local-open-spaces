// [기상청 단기예보 조회서비스 연동 어댑터](2026-09-01 사용자 지시) — getVilageFcst는
// 매일 02, 05, 08, 11, 14, 17, 20, 23시(KST) 8회 발표하고, `base_time`은 반드시 이
// 8개 값(HH00) 중 하나여야 한다(기상청 API 활용가이드 공식 스펙). 발표 직후 API에
// 실제 반영되기까지 짧은 지연이 있어(과거 이 프로젝트의 다른 배치에서도 "발표 후 API
// 반영 지연" 문제를 겪은 바 있음 — 2026-08-28 statement timeout류와는 다른 종류지만
// "방금 발표된 시각을 바로 요청하면 아직 데이터가 없을 수 있다"는 동일한 성격의 위험),
// 안전하게 10분의 여유를 두고 계산한다.
const PUBLISH_HOURS_KST = [2, 5, 8, 11, 14, 17, 20, 23];
const PUBLISH_DELAY_MIN = 10;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// referenceDate는 어떤 로컬 타임존에서 실행되든(GitHub Actions 러너는 UTC, 로컬 개발
// 환경은 그 외 임의의 타임존일 수 있음) 항상 올바른 결과를 내야 하므로, Date 객체의
// 로컬 getter가 아니라 UTC epoch 산술로 KST 벽시계 시각을 직접 계산한다.
export function getLatestVilageFcstBaseTime(referenceDate = new Date()) {
  const delayedKst = new Date(referenceDate.getTime() + KST_OFFSET_MS - PUBLISH_DELAY_MIN * 60 * 1000);
  const year = delayedKst.getUTCFullYear();
  const month = delayedKst.getUTCMonth();
  const day = delayedKst.getUTCDate();
  const hour = delayedKst.getUTCHours();

  let candidateHour = null;
  for (let i = PUBLISH_HOURS_KST.length - 1; i >= 0; i -= 1) {
    if (PUBLISH_HOURS_KST[i] <= hour) {
      candidateHour = PUBLISH_HOURS_KST[i];
      break;
    }
  }

  // 오늘 KST 새벽 2시(-10분 지연 적용) 발표조차 아직이면 전날 23시 발표가 최신이다.
  // Date.UTC(year, month, day - 1)은 day=1일 때도 월/연도 롤오버를 자동으로 처리한다.
  const baseDateUtc =
    candidateHour === null ? new Date(Date.UTC(year, month, day - 1)) : new Date(Date.UTC(year, month, day));
  if (candidateHour === null) candidateHour = 23;

  const baseDate = `${baseDateUtc.getUTCFullYear()}${String(baseDateUtc.getUTCMonth() + 1).padStart(2, '0')}${String(
    baseDateUtc.getUTCDate()
  ).padStart(2, '0')}`;
  const baseTime = `${String(candidateHour).padStart(2, '0')}00`;

  return { baseDate, baseTime };
}

// getUltraSrtNcst(초단기실황, 요구사항 2의 "선택적 적용" 보강용)는 getVilageFcst와
// 발표 스케줄이 다르다 — 매시 정각 관측값을 그 시각+10분경 API에 반영한다(하루 8회가
// 아니라 매시간). "10분 지연 후 정시로 내림"만 하면 되므로 별도의 8회 스케줄 탐색이
// 필요 없다.
export function getLatestUltraSrtNcstBaseTime(referenceDate = new Date()) {
  const delayedKst = new Date(referenceDate.getTime() + KST_OFFSET_MS - PUBLISH_DELAY_MIN * 60 * 1000);
  const baseDate = `${delayedKst.getUTCFullYear()}${String(delayedKst.getUTCMonth() + 1).padStart(2, '0')}${String(
    delayedKst.getUTCDate()
  ).padStart(2, '0')}`;
  const baseTime = `${String(delayedKst.getUTCHours()).padStart(2, '0')}00`;
  return { baseDate, baseTime };
}
