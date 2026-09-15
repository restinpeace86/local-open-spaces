// [관리자 대시보드 '오늘 반영 현황' 타임존 버그 수정](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 4]): 서버(Vercel 서버리스 함수)는 항상 UTC로
// 동작한다. 기존 코드는 "오늘 00:00"을 `new Date().toISOString()`(UTC 자정) 또는
// 관리자가 입력한 날짜 문자열을 그대로 `${dateStr}T00:00:00.000Z`(UTC 자정)로
// 해석했는데, 한국(KST, UTC+9)의 하루 경계는 UTC 자정보다 9시간 이르다 — 그 결과
// 매일 00:00~09:00 KST 사이에는 "오늘" 경계가 아직 다음 UTC 자정에 도달하지 않아,
// 이미 KST로는 오늘인 행들이 집계에서 누락되는(또는 완전히 다른 날짜로 취급되는)
// 현상이 재현됐다(실측: KST 02:00 기준 `new Date().toISOString().slice(0,10)`은
// 전날 날짜를 반환).
//
// 이 파일은 서버 전용 KST 날짜 계산 유틸이다. 클라이언트(브라우저)는 관리자가 실제로
// 한국 시간대에서 접속한다고 전제할 수 있어(내부 운영 도구, 일반 사용자 대상 아님)
// 로컬 Date 컴포넌트(getFullYear/getMonth/getDate)를 그대로 쓰면 되고 이 유틸이
// 필요 없다 — 반대로 서버는 "한국에 있는 시각"이라는 개념 자체가 없어(항상 UTC)
// 명시적으로 9시간을 더한 뒤 UTC getter로 읽는 변환이 필요하다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 주어진 시각(기본값: 지금) 기준 KST 달력 날짜를 "YYYY-MM-DD"로 반환한다.
export function todayKstDateString(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "YYYY-MM-DD"를 그 날짜의 KST 00:00:00 시각으로 해석해, 그 순간의 UTC ISO 문자열을
// 반환한다(예: "2026-09-15" → KST 자정은 UTC로 "2026-09-14T15:00:00.000Z").
export function kstDateStringToUtcIso(dateStr: string): string {
  const kstMidnightAsUtcMs = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  return new Date(kstMidnightAsUtcMs - KST_OFFSET_MS).toISOString();
}

// 오늘(KST) 00:00:00의 UTC ISO 문자열 — "오늘 신규/갱신 건수" 집계 쿼리의 하한값으로 쓴다.
export function todayStartIsoKst(now: Date = new Date()): string {
  return kstDateStringToUtcIso(todayKstDateString(now));
}
