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
