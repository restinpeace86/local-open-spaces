// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 1단계(When): "오늘/내일/이번 주
// 토요일/이번 주 일요일/직접 선택" 칩 선택을 실제 ISO 날짜(YYYY-MM-DD)로 변환한다. LLM을
// 쓰지 않는 순수 계산이라 이 모듈 전체가 결정적 함수로만 구성된다(요구사항 2-① 원칙).
//
// [타임존 독립성] 이 서비스는 KST 기준 "오늘"을 계산해야 하는데, 실행 환경(로컬 개발/Vercel
// 서버리스 등)의 로컬 타임존은 UTC일 수도 KST일 수도 있다 — `scripts/ingest/lib/kma-base-
// time.mjs`가 이미 겪고 해결한 것과 동일한 문제라 같은 UTC epoch 산술 관례를 그대로 따른다:
// `now`(실제 시각)를 KST로 환산한 뒤, 그 시각의 "날짜만"을 UTC 자정으로 정규화해 이후의
// getDay()/setDate() 등 Date 메서드가 로컬 타임존과 무관하게 항상 같은 결과를 내게 한다.
//
// "이번 주 토요일/일요일"은 항상 오늘이거나 미래 날짜여야 한다(나들이 계획 챗봇에서 이미
// 지나간 주말을 제안하면 의미가 없다) — 오늘이 일요일인데 "이번 주 토요일"을 문자 그대로
// 계산하면 어제가 나와버리는 문제를 피하기 위해, "이번 주"를 "오늘부터 돌아오는 가장 가까운
// 토/일요일"로 정의한다(오늘이 토/일요일이면 오늘 자신).
export type WhenChoice = 'TODAY' | 'TOMORROW' | 'THIS_SATURDAY' | 'THIS_SUNDAY' | 'CUSTOM';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// `now`(실제 epoch 시각)를 KST 달력 날짜로 정규화해, UTC 자정을 나타내는 Date로 반환한다.
// 이후 getUTCDay()/setUTCDate() 등 UTC 계열 메서드로만 다뤄야 로컬 타임존과 무관해진다.
function toKstCalendarDate(now: Date): Date {
  const kstEpoch = now.getTime() + KST_OFFSET_MS;
  const kst = new Date(kstEpoch);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

function toIsoDate(dateOnlyUtc: Date): string {
  return dateOnlyUtc.toISOString().slice(0, 10);
}

function addDays(dateOnlyUtc: Date, days: number): Date {
  const result = new Date(dateOnlyUtc);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// now: 0(일)~6(토) — JS Date.getUTCDay()와 동일한 규약, KST 달력 날짜 기준.
export function resolveThisSaturday(now: Date): Date {
  const today = toKstCalendarDate(now);
  const dow = today.getUTCDay();
  const daysUntilSaturday = (6 - dow + 7) % 7;
  return addDays(today, daysUntilSaturday);
}

export function resolveThisSunday(now: Date): Date {
  const today = toKstCalendarDate(now);
  const dow = today.getUTCDay();
  const daysUntilSunday = (7 - dow) % 7; // 오늘이 일요일(dow=0)이면 0
  return addDays(today, daysUntilSunday);
}

// customDate: '직접 선택' 캘린더에서 고른 YYYY-MM-DD 문자열. CUSTOM 선택인데 값이 없으면
// 추측하지 않고 null을 반환한다(호출부가 날짜 선택을 계속 요구해야 함).
export function resolveWhenChoice(choice: WhenChoice, customDate: string | null, now: Date = new Date()): string | null {
  switch (choice) {
    case 'TODAY':
      return toIsoDate(toKstCalendarDate(now));
    case 'TOMORROW':
      return toIsoDate(addDays(toKstCalendarDate(now), 1));
    case 'THIS_SATURDAY':
      return toIsoDate(resolveThisSaturday(now));
    case 'THIS_SUNDAY':
      return toIsoDate(resolveThisSunday(now));
    case 'CUSTOM':
      return customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate) ? customDate : null;
    default:
      return null;
  }
}

export function isToday(isoDate: string, now: Date = new Date()): boolean {
  return isoDate === toIsoDate(toKstCalendarDate(now));
}
