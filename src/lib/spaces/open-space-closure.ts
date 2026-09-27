// [open_spaces 정기휴무 마커/리스트 표시](2026-09-27 사용자 지시): "정기휴무일은
// 마커도.. 회색으로 칠해주고.. 오늘이 정기휴무하는 일자면 회색으로 띄우고..
// 마커눌렀을때도 오늘은 정기휴무입니다 띄워주고.. 리스트 나올때도.. 연한 회색으로
// 리스트 색칠" — open_spaces.excluded_weekdays/excluded_nth_weekdays로 "오늘"이
// 닫혀 있는지 판정하는 순수 함수. events의 isEventOperatingOn(event-operating-
// schedule.ts)과 토큰 형식("N-요일코드")은 그대로 재사용하지만, 반대 극성이라
// (events의 operating_nth_weekdays="이 날에만 연다" vs 여기 excluded_nth_weekdays=
// "이 날에 추가로 닫는다") 그 함수를 그대로 호출하지 않고 별도로 둔다(2026-09-27-
// open-spaces-excluded-weekdays.sql 마이그레이션 주석 참고).
import { WEEKDAY_CODES, buildNthWeekdayToken, type NthWeekdayOccurrence, type WeekdayCode } from './event-operating-schedule';

function nthWeekdayOccurrenceOf(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

export function isOpenSpaceClosedOn(
  excludedWeekdays: string[] | null | undefined,
  excludedNthWeekdays: string[] | null | undefined,
  date: Date
): boolean {
  const code: WeekdayCode = WEEKDAY_CODES[date.getDay()];
  if (excludedWeekdays && excludedWeekdays.includes(code)) return true;
  if (excludedNthWeekdays && excludedNthWeekdays.length > 0) {
    const token = buildNthWeekdayToken(nthWeekdayOccurrenceOf(date) as NthWeekdayOccurrence, code);
    if (excludedNthWeekdays.includes(token)) return true;
  }
  return false;
}
