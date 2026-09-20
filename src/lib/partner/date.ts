// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): 이 프로젝트에는 아직
// "YYYY-MM-DD 문자열에 N일 더하기" 유틸이 없어(kst-date-range.ts는 "오늘"만 계산)
// 새로 만든다. "오늘(KST)" 자체는 기존 서버 전용 유틸(src/lib/admin/kst-date-range.ts,
// 관리자 대시보드 집계용으로 이미 검증됨)을 그대로 재사용한다(제5장 제4조 기존
// 구조 우선 — 디렉토리 이름이 admin이어도 로직 자체는 일반적인 KST 계산이라 재사용에
// 문제 없음).
export { todayKstDateString } from '@/lib/admin/kst-date-range';

const WEEKDAY_LABELS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// "YYYY-MM-DD" 문자열에 일수를 더하거나 뺀다(음수 허용). 문자열을 UTC 자정으로
// 해석해 날짜만 계산하므로 타임존/DST 영향을 받지 않는다.
export function addDaysToDateStr(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "2026-09-20" → "2026년 9월 20일 (일)" — 일간 뷰 상단 날짜 표시용.
export function formatKoreanDateWithWeekday(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const weekday = WEEKDAY_LABELS_KO[date.getUTCDay()];
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${weekday})`;
}

// "2026-09-22" → "9/22 (화)" — 주간 뷰의 요일별 행 헤더처럼 짧은 표기가 필요한 곳.
export function formatMonthDayWithWeekday(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const weekday = WEEKDAY_LABELS_KO[date.getUTCDay()];
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()} (${weekday})`;
}

// "2026-09-20" → "2026년 9월" — 월간 뷰 상단 헤더용.
export function formatKoreanYearMonth(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월`;
}

// [나드리픽 파트너 PMS — 주간 뷰](2026-09-20 사용자 지시): "월, 화, 수, 목, 금, 토,
// 일의 7개 리스트 row"(docs/partner_spec.md 5절) — 월요일을 주의 시작으로 삼는다.
// 주어진 날짜가 속한 주의 월요일을 반환한다.
export function getMondayOfWeek(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const weekday = date.getUTCDay(); // 0=일 ... 6=토
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToDateStr(dateStr, diffToMonday);
}

// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시): 주어진 날짜가 속한 달의
// 1일/마지막날을 반환한다.
export function getFirstDayOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function getLastDayOfMonth(dateStr: string): string {
  const [year, month] = dateStr.slice(0, 7).split('-').map(Number);
  // Date.UTC의 day 인자에 0을 넣으면 그 달(1-indexed 그대로 month 인자에 넣었을 때)의
  // 하루 전, 즉 "이전 달의 마지막 날"이 아니라 "그 달의 마지막 날"이 된다 — month
  // 인자가 0-indexed라 1-indexed month 값을 그대로 넣으면 "다음 달의 0일째" = 이번
  // 달 마지막 날로 자동 보정된다.
  const lastDay = new Date(Date.UTC(year, month, 0));
  return lastDay.toISOString().slice(0, 10);
}

// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시): 월 이동 컨트롤러용 —
// 항상 그 달의 1일을 반환한다(월 이동에는 "몇 번째 날짜였는지"가 의미 없고, 말일
// 기준으로 계산하면 31일→2월처럼 존재하지 않는 날짜가 생기는 문제도 원천 차단됨).
export function addMonthsToDateStr(dateStr: string, months: number): string {
  const [year, month] = dateStr.slice(0, 7).split('-').map(Number);
  const totalMonths = (month - 1) + months;
  const nextYear = year + Math.floor(totalMonths / 12);
  const nextMonth = ((totalMonths % 12) + 12) % 12;
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;
}
