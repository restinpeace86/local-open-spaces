// [실내/야외 분류 LLM 파이프라인 — 매일 신규분만](2026-09-17 사용자 지시): "매일
// 새로 들어오는거에 대하여.. 오늘 신규 반영된 건들에 한해서"에 쓰는 "오늘(KST) 자정"
// 계산 유틸. src/lib/admin/kst-date-range.ts와 완전히 동일한 로직을 그대로 옮겼다
// (제5장 제4조 — 이미 검증된 계산 로직을 재사용, scripts/는 TS를 직접 import하지
// 않는 기존 관례에 따라 .mjs로 복제).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayKstDateString(now = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function kstDateStringToUtcIso(dateStr) {
  const kstMidnightAsUtcMs = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  return new Date(kstMidnightAsUtcMs - KST_OFFSET_MS).toISOString();
}

export function todayStartIsoKst(now = new Date()) {
  return kstDateStringToUtcIso(todayKstDateString(now));
}

// [실측으로 발견한 타임존 버그 수정](2026-09-22 사용자 지시로 검토 중 발견): 서울시
// 공공서비스예약 API(RCPTBGNDT/RCPTENDDT 등)는 "2026-08-25 09:00:00.0"처럼 시간대
// 표시가 전혀 없는 "naive" 문자열을 내려주는데, 이게 한국시간(KST) 09시라는 뜻임에도
// 이 문자열을 그대로 timestamptz 컬럼에 넣으면 Postgres가 세션 기준(이 프로젝트는
// UTC)으로 해석해 "UTC 09시(=KST 오후 6시)"로 잘못 저장되고 있었다(실측: raw_data의
// 원본 RCPTBGNDT와 실제 저장된 reservation_start_date를 직접 대조해 9시간 밀림을
// 확인). kstDateStringToUtcIso는 "날짜만"(자정 기준)만 다뤄 이 경우엔 못 쓰므로,
// 시/분/초까지 포함한 naive 문자열 전용 변환 함수를 추가한다. 형식이 예상과 다르면
// (추측 금지) null을 반환해 호출부가 안전하게 스킵하게 한다.
export function kstNaiveDatetimeToUtcIso(raw) {
  if (!raw) return null;
  const match = String(raw)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const asIfUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(asIfUtcMs - KST_OFFSET_MS).toISOString();
}
