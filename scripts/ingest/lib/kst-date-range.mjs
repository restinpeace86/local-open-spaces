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
