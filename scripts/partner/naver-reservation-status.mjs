// [나드리픽 파트너 PMS — 네이버 예약 스태프 계정 동기화 봇](2026-09-21 사용자 지시):
// 네이버 예약 파트너센터가 화면에 표시하는 한국어 상태 라벨을
// bookings.status(confirmed/completed/noshow/cancelled)로 매핑한다. 실제 화면
// 라벨 문구를 아직 확인하지 못해(추측 금지 원문 고지, naver-reservation-sync-bot.mjs
// 헤더 주석 참고) 흔히 쓰이는 표현 후보를 폭넓게 잡았다 — 실제 라벨 확인 후 이
// 배열만 조정하면 된다. 어떤 후보에도 안 걸리면 조용히 'confirmed'로 추측하지
// 않고, 원본 문구를 그대로 로그에 남기도록 호출부에 알 수 있게 null을 반환한다.
const STATUS_LABELS = {
  cancelled: ['취소'],
  noshow: ['노쇼', 'No-show', 'NOSHOW'],
  completed: ['완료', '이용완료', '방문완료'],
  confirmed: ['확정', '예약확정', '승인'],
};

export function mapNaverReservationStatus(rawLabel) {
  const trimmed = (rawLabel ?? '').trim();
  for (const [status, labels] of Object.entries(STATUS_LABELS)) {
    if (labels.some((label) => trimmed.includes(label))) return status;
  }
  return null;
}
