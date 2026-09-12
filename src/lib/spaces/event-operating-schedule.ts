// [관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가](2026-09-12 사용자
// 지시): "일자는 기본적으로 원천데이터꺼로 하긴 하는데 예외 규칙을 여기서 집어넣으면
// 해당 예외 규칙도 적용되도록.. 이벤트 기간중에 있더라도 이에 부합하지 않으면
// 안나오도록해야돼". start_date~end_date(기간) 안에서도 특정 요일에만 운영하거나
// 특정 요일엔 휴무인 경우를 판정하는 순수 함수 — 관리자가 저장한 예외 규칙을
// "오늘"이 실제로 만족하는지 계산해, 기간 내에 있어도 노출을 막을 수 있게 한다.

export const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export type OperatingSchedule = {
  // 허용 요일 목록. null/undefined/빈 배열 = 제약 없음(모든 요일 허용).
  operating_weekdays?: string[] | null;
  // 정기 휴무 요일 목록. null/undefined/빈 배열 = 휴무 없음.
  excluded_weekdays?: string[] | null;
};

// [테스트에서 날짜를 고정할 수 있도록] date를 인자로 받는다(내부에서 new Date()를
// 직접 만들지 않음) — 호출부(스팟 연결 이벤트 API 등)가 "오늘"을 넘긴다.
export function isEventOperatingOn(schedule: OperatingSchedule, date: Date): boolean {
  const code = WEEKDAY_CODES[date.getDay()];

  if (schedule.excluded_weekdays && schedule.excluded_weekdays.includes(code)) {
    return false;
  }
  if (schedule.operating_weekdays && schedule.operating_weekdays.length > 0) {
    return schedule.operating_weekdays.includes(code);
  }
  return true;
}
