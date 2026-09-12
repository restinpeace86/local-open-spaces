// [관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가](2026-09-12 사용자
// 지시): "일자는 기본적으로 원천데이터꺼로 하긴 하는데 예외 규칙을 여기서 집어넣으면
// 해당 예외 규칙도 적용되도록.. 이벤트 기간중에 있더라도 이에 부합하지 않으면
// 안나오도록해야돼". start_date~end_date(기간) 안에서도 특정 요일에만 운영하거나
// 특정 요일엔 휴무인 경우를 판정하는 순수 함수 — 관리자가 저장한 예외 규칙을
// "오늘"이 실제로 만족하는지 계산해, 기간 내에 있어도 노출을 막을 수 있게 한다.

export const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

// [매월 N번째 요일 패턴 추가](2026-09-12 사용자 지시): "매주 토요일 / 매월 2번째
// 4번째 토요일 / 매주 주말 / 매주 월요일 휴무 / 매주 화,목 운영 이런식의 패턴이야
// 대부분" — 기존 operating_weekdays(매주 반복)만으로는 "2번째·4번째 토요일만"처럼
// 월 기준 N번째 주 패턴을 표현할 수 없다. "N-요일코드" 토큰(예: '2-SAT')의 배열로
// 별도 컬럼(operating_nth_weekdays)에 저장한다 — operating_weekdays(매주 반복)와는
// 상호 배타적인 대안 규칙이고(관리자가 "매주" 모드 또는 "매월 N번째" 모드 중 하나만
// 고름), excluded_weekdays(정기 휴무)는 어느 쪽과도 계속 조합 가능하다.
export const NTH_WEEKDAY_OCCURRENCES = [1, 2, 3, 4, 5] as const;
export type NthWeekdayOccurrence = (typeof NTH_WEEKDAY_OCCURRENCES)[number];

const NTH_WEEKDAY_TOKEN_RE = /^([1-5])-(SUN|MON|TUE|WED|THU|FRI|SAT)$/;

export function isNthWeekdayToken(value: unknown): value is string {
  return typeof value === 'string' && NTH_WEEKDAY_TOKEN_RE.test(value);
}

export function buildNthWeekdayToken(nth: NthWeekdayOccurrence, weekday: WeekdayCode): string {
  return `${nth}-${weekday}`;
}

export function parseNthWeekdayToken(token: string): { nth: number; weekday: WeekdayCode } | null {
  const match = NTH_WEEKDAY_TOKEN_RE.exec(token);
  if (!match) return null;
  return { nth: Number(match[1]), weekday: match[2] as WeekdayCode };
}

// 해당 날짜가 그 달에서 같은 요일 기준 몇 번째 등장인지(1~5). 예: 9월 12일이 토요일이면
// 9월의 토요일은 5,12,19,26일 순이므로 12일은 2번째 토요일 → 2.
function nthWeekdayOccurrenceOf(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

export type OperatingSchedule = {
  // 매주 반복되는 허용 요일 목록. null/undefined/빈 배열 = 제약 없음(모든 요일 허용).
  // operating_nth_weekdays가 채워져 있으면 이 필드는 무시된다(상호 배타적 대안 규칙).
  operating_weekdays?: string[] | null;
  // 정기 휴무 요일 목록. null/undefined/빈 배열 = 휴무 없음. 아래 두 허용 규칙
  // 중 어느 쪽과도 조합 가능하며, 항상 최우선으로 검사한다.
  excluded_weekdays?: string[] | null;
  // 매월 N번째 요일 패턴("2-SAT" = 매월 2번째 토요일). null/undefined/빈 배열 =
  // 이 규칙 없음. 채워져 있으면 operating_weekdays보다 우선한다.
  operating_nth_weekdays?: string[] | null;
};

// [테스트에서 날짜를 고정할 수 있도록] date를 인자로 받는다(내부에서 new Date()를
// 직접 만들지 않음) — 호출부(스팟 연결 이벤트 API 등)가 "오늘"을 넘긴다.
export function isEventOperatingOn(schedule: OperatingSchedule, date: Date): boolean {
  const code = WEEKDAY_CODES[date.getDay()];

  if (schedule.excluded_weekdays && schedule.excluded_weekdays.includes(code)) {
    return false;
  }
  if (schedule.operating_nth_weekdays && schedule.operating_nth_weekdays.length > 0) {
    const token = buildNthWeekdayToken(nthWeekdayOccurrenceOf(date) as NthWeekdayOccurrence, code);
    return schedule.operating_nth_weekdays.includes(token);
  }
  if (schedule.operating_weekdays && schedule.operating_weekdays.length > 0) {
    return schedule.operating_weekdays.includes(code);
  }
  return true;
}
