// [일정/스케줄 정규화](2026-10-06 todo.md 개선사항 3): "강좌 원문 텍스트에서
// 일정 및 스케줄 관련 정보(시작일, 종료일, 요일, 시간, 총 회차, 차수)를
// 파싱하여 ... 정형화" — 실측 확인(2026-10-06): 이마트/롯데마트 둘 다 이미
// class_start_date(YYYYMMDD 텍스트)/class_day(한글 요일 배열)/start_time/
// end_time을 구조화된 컬럼으로 갖고 있다(원문 제목에 적힌 날짜는 이 컬럼과
// 중복되는 장식용 텍스트라 제목을 다시 정규식으로 파싱하지 않는다 — 이미
// 있는 신뢰할 수 있는 구조화 컬럼을 우선 활용, 제5장 제4조). 실제로 새로
// 파싱이 필요한 건: ①요일을 표준 코드로, ②날짜 텍스트를 Date 타입으로,
// ③회차 수(총 session), ④차수(round) — 이 둘은 이마트는 제목에만 있고
// (session_count 컬럼 자체가 없음), 롯데마트는 session_count 컬럼이 이미
// 있고 차수 개념 자체가 없다(스펙 본문도 이를 인정: "롯데마트는 별도 차수
// 표기가 없으므로 null 처리").
const DAY_CODE_MAP = {
  월: 'MON',
  화: 'TUE',
  수: 'WED',
  목: 'THU',
  금: 'FRI',
  토: 'SAT',
  일: 'SUN',
};

export function koreanDayToCode(day) {
  return DAY_CODE_MAP[day] ?? null;
}

export function normalizeDaysToCodes(days) {
  if (!Array.isArray(days)) return null;
  const codes = days.map(koreanDayToCode).filter((code) => code !== null);
  return codes.length > 0 ? codes : null;
}

// register_start_date처럼 뒤에 HHmm이 더 붙어 있어도 날짜 8자만 취한다
// (시각은 이미 register_start_at에서 별도로 다룬다 — emart-culture-club.mjs
// parseRegisterStartAt 참고).
export function yyyymmddToIso(text) {
  if (!text || text.length < 8) return null;
  const digits = text.slice(0, 8);
  if (!/^\d{8}$/.test(digits)) return null;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  return `${year}-${month}-${day}`;
}

// [이마트 전용] 차수 표기(스펙 예시: "[3차-11/6~11/27] 4회" → round=3). 롯데
// 마트는 이 개념이 없어 호출하지 않는다.
const ROUND_REGEX = /(\d{1,2})\s*차/;

export function parseRoundFromTitle(title) {
  if (!title) return null;
  const match = title.match(ROUND_REGEX);
  return match ? Number(match[1]) : null;
}

// [이마트 전용] 총 회차. 제목에 "N회" 또는 "N주"로 표기된다(실측: "[8주]",
// "[8회/10월7일 개강]" 등) — 둘 다 "총 수업 횟수"를 나타내는 것으로 같이
// 취급한다(스펙도 "8주 -> 8"을 totalSessions 예시로 든다).
const TOTAL_SESSIONS_REGEX = /(\d{1,2})\s*(회|주)/;

export function parseTotalSessionsFromTitle(title) {
  if (!title) return null;
  const match = title.match(TOTAL_SESSIONS_REGEX);
  return match ? Number(match[1]) : null;
}
