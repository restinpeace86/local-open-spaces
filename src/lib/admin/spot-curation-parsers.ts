// [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
// 섹션 2 "스마트 텍스트 파서": 영업시간/메뉴 텍스트 덩어리를 통째로 붙여넣으면 구조화된
// 필드로 쪼개주는 순수 함수. 관리자가 실제로 웹에서 복사해 붙여넣을 법한 다양한 표기
// ("10:00~22:00", "10:00-22:00", "브레이크타임 15:00~17:00", "라스트오더 21:30"/"L.O 21:30")를
// 다루되, 파싱에 실패한 항목은 억지로 추측해 채우지 않고 null/제외로 남긴다(제3장 제5조
// 추측 금지) — 원문(operating_hours_raw)은 파싱 성공 여부와 무관하게 그대로 보존되므로
// 관리자가 나중에 수동으로 보정할 수 있다.

export type ParsedOperatingHours = {
  openTime: string | null;
  closeTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  lastOrder: string | null;
};

const TIME_RANGE = /(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})/g;
const BREAK_KEYWORD = /(?:브레이크\s*타임|브레이크타임|휴게\s*시간|휴게시간)/;
const LAST_ORDER_KEYWORD = /(?:라스트\s*오더|라스트오더|L\.?\s*O\.?|주문\s*마감|주문마감)/i;

// 텍스트 안에서 "브레이크타임 10:00~11:00"처럼 키워드 바로 뒤에 오는 시간 범위 하나를
// 찾는다. 키워드가 없으면 null.
function extractLabeledRange(text: string, keyword: RegExp): { start: string; end: string; matchedText: string } | null {
  const keywordMatch = text.match(keyword);
  if (!keywordMatch || keywordMatch.index === undefined) return null;

  const rest = text.slice(keywordMatch.index);
  const rangeMatch = rest.match(/(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})/);
  if (!rangeMatch) return null;

  return { start: rangeMatch[1], end: rangeMatch[2], matchedText: rangeMatch[0] };
}

function extractLabeledTime(text: string, keyword: RegExp): string | null {
  const keywordMatch = text.match(keyword);
  if (!keywordMatch || keywordMatch.index === undefined) return null;

  const rest = text.slice(keywordMatch.index);
  const timeMatch = rest.match(/(\d{1,2}:\d{2})/);
  return timeMatch ? timeMatch[1] : null;
}

export function parseOperatingHoursText(text: string): ParsedOperatingHours {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return { openTime: null, closeTime: null, breakStart: null, breakEnd: null, lastOrder: null };
  }

  const breakRange = extractLabeledRange(trimmed, BREAK_KEYWORD);
  const lastOrder = extractLabeledTime(trimmed, LAST_ORDER_KEYWORD);

  // 메인 영업시간(휴게시간 범위와 겹치지 않는 첫 번째 시간 범위)을 찾는다 — 브레이크타임
  // 범위 문자열을 제외한 나머지 텍스트에서 첫 매치를 취한다.
  const textWithoutBreak = breakRange ? trimmed.replace(breakRange.matchedText, '') : trimmed;
  TIME_RANGE.lastIndex = 0;
  const mainMatch = TIME_RANGE.exec(textWithoutBreak);

  return {
    openTime: mainMatch ? mainMatch[1] : null,
    closeTime: mainMatch ? mainMatch[2] : null,
    breakStart: breakRange?.start ?? null,
    breakEnd: breakRange?.end ?? null,
    lastOrder,
  };
}

export type ParsedMenuItem = { name: string; price: number };

// "짜장면 7,000원" / "짬뽕 9000원" / "탕수육 15,000" 처럼 "이름 + 가격(원 접미사 선택)"
// 한 줄씩을 파싱한다. 가격을 못 찾은 줄은 결과에서 제외한다(추측 금지 — 임의로 0원 등을
// 채우지 않음).
const MENU_LINE = /^(.+?)\s+([\d,]+)\s*원?\s*$/;

export function parseMenuText(text: string): ParsedMenuItem[] {
  const lines = (text ?? '').split('\n');
  const items: ParsedMenuItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(MENU_LINE);
    if (!match) continue;

    const name = match[1].trim();
    const price = Number(match[2].replace(/,/g, ''));
    if (!name || !Number.isFinite(price)) continue;

    items.push({ name, price });
  }

  return items;
}
