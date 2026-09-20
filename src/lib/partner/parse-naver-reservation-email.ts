import { todayKstDateString } from '@/lib/partner/date';
import { formatPhoneNumber } from '@/lib/partner/format-phone';

// [나드리픽 파트너 PMS — 클라우드플레어 인바운드 메일 연동](2026-09-21 사용자
// 지시): "메일 본문에서 네이버 예약 알림 양식(예약자명, 연락처, 날짜, 시간, 인원)을
// 추출하는 정규식 파싱 로직 구현".
//
// [정직한 한계 고지] 이 세션에는 실제로 수신된 "네이버 예약 알림" 메일 원문
// 샘플이 없다(메일함 접근 권한이 없어 실측 불가) — 다른 크롤링 작업(네이버
// 플레이스 HTML 등)과 달리 이번엔 라이브 데이터로 검증하지 못했다(제3장 제5조
// 추측 금지 원칙에 정면으로 걸리는 지점). 그래서 완전히 새로운 포맷을 확신 있게
// 하드코딩하는 대신, 한국 예약 알림 메일에서 흔히 쓰이는 라벨 표현(예약자/예약자명/
// 성함, 연락처/전화번호/휴대폰, 예약일/방문일/예약일시, 예약시간/방문시간,
// 인원/방문인원/인원수)을 여러 개 후보로 두고 순서대로 시도하는 유연한 파서로
// 구현했다. 실제 메일 샘플이 확보되면 이 라벨 후보 배열과 날짜/시간 정규식만
// 조정하면 된다 — 로직 구조 자체를 바꿀 필요는 없도록 설계했다.
// 한 항목이라도 확신 있게 추출하지 못하면 추측으로 채우지 않고 전체를 null로
// 반환한다(호출부가 422로 명확히 실패 처리).
export type ParsedReservationEmail = {
  customerName: string;
  customerPhone: string;
  bookingDate: string; // "YYYY-MM-DD"
  bookingTime: string; // "HH:MM"
  headcount: number;
};

const NAME_LABELS = ['예약자명', '예약자', '성함', '이름'];
const PHONE_LABELS = ['연락처', '전화번호', '휴대폰', '핸드폰번호', '핸드폰'];
// 날짜와 시간이 한 줄에 같이 오는 경우("예약일시: 2026년 9월 25일 오후 2시 30분")를
// 먼저 시도하고, 실패하면 날짜/시간을 각각 따로 찾는 라벨로 폴백한다.
const DATETIME_LABELS = ['예약일시', '방문일시'];
const DATE_LABELS = ['예약날짜', '예약일', '방문일', '날짜'];
const TIME_LABELS = ['방문시간', '예약시간', '시간'];
const HEADCOUNT_LABELS = ['방문인원', '예약인원', '인원수', '인원'];

// 라벨 뒤 콜론(옵션) 다음 값을, 그 줄이 끝날 때까지 뽑는다. 후보 라벨을 순서대로
// 시도해 처음 매칭되는 것을 쓴다.
function extractLabeledValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]?\\s*([^\\n\\r]+)`, 'u');
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractPhone(labeledValue: string | null, fullText: string): string | null {
  const PHONE_PATTERN = /01[0-9]-?\d{3,4}-?\d{4}/;
  const fromLabel = labeledValue?.match(PHONE_PATTERN)?.[0];
  // 라벨 값에서 못 찾으면(예: 라벨이 아예 없거나 다른 표현을 쓴 경우) 본문 전체에서
  // 휴대폰 번호 패턴을 한 번 더 찾는다 — 010으로 시작하는 번호 형식은 그 자체로
  // 충분히 특이해 오탐 위험이 낮다.
  const raw = fromLabel ?? fullText.match(PHONE_PATTERN)?.[0];
  return raw ? formatPhoneNumber(raw) : null;
}

function extractDate(text: string): string | null {
  let match = text.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

  match = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

  // 연도가 생략된 경우("9월 25일") — 예약 알림 메일은 항상 가까운 미래를
  // 가리킨다는 전제로 발송 시점(KST 기준 오늘)의 연도를 그대로 쓴다. 완벽한
  // 보장은 아니지만(예: 12월에 1월 예약을 알리는 경우) 연도 자체가 없는 입력에서
  // 유일하게 근거 있는 대안이다.
  match = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (match) {
    const year = todayKstDateString().slice(0, 4);
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  return null;
}

function extractTime(text: string): string | null {
  let match = text.match(/([01]?\d|2[0-3]):([0-5]\d)/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;

  match = text.match(/(오전|오후)\s*(\d{1,2})시\s*(\d{1,2})?분?/);
  if (match) {
    const period = match[1];
    let hour = Number(match[2]);
    const minute = match[3] ? Number(match[3]) : 0;
    if (period === '오후' && hour !== 12) hour += 12;
    if (period === '오전' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  return null;
}

// "성인 2명, 아동 2명"처럼 여러 항목으로 나뉜 인원 표기를 흔히 쓰므로, 라벨 값
// 안에 등장하는 모든 "숫자+명"을 더한 합계를 총 인원으로 본다.
function sumHeadcount(text: string): number | null {
  const matches = [...text.matchAll(/(\d+)\s*명/g)];
  if (matches.length === 0) return null;
  const total = matches.reduce((sum, m) => sum + Number(m[1]), 0);
  return total > 0 ? total : null;
}

export function parseNaverReservationEmail(bodyText: string): ParsedReservationEmail | null {
  const customerName = extractLabeledValue(bodyText, NAME_LABELS);
  const phoneLabelValue = extractLabeledValue(bodyText, PHONE_LABELS);
  const customerPhone = extractPhone(phoneLabelValue, bodyText);

  const dateTimeValue = extractLabeledValue(bodyText, DATETIME_LABELS);
  const dateValue = dateTimeValue ?? extractLabeledValue(bodyText, DATE_LABELS);
  const bookingDate = dateValue ? extractDate(dateValue) : null;

  const timeValue = extractLabeledValue(bodyText, TIME_LABELS) ?? dateTimeValue;
  const bookingTime = timeValue ? extractTime(timeValue) : null;

  const headcountValue = extractLabeledValue(bodyText, HEADCOUNT_LABELS);
  const headcount = headcountValue ? sumHeadcount(headcountValue) : null;

  if (!customerName || !customerPhone || !bookingDate || !bookingTime || !headcount) {
    return null;
  }
  return { customerName, customerPhone, bookingDate, bookingTime, headcount };
}
