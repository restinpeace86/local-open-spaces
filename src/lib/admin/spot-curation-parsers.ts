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

// [실사용 버그 제보](2026-09-02): "15:00 - 17:00 브레이크타임" / "20:30 라스트오더"처럼
// 시간이 키워드보다 *앞*에 오는 표기(관리자가 실제로 붙여넣은 형식)에서 브레이크타임/
// 라스트오더가 전혀 파싱되지 않았다 — 원인은 옛 구현이 "키워드 위치부터 뒤쪽 텍스트만"
// 검색해 키워드 앞의 시간을 놓쳤기 때문이다. 이제는 줄 단위로 키워드가 포함된 줄을 찾고,
// 그 줄 안에서 키워드와 가장 가까운(앞이든 뒤든) 시간(범위)을 채택한다 — 기존에 검증된
// "키워드 다음에 시간" 형식과 한 줄에 메인 시간+브레이크+라스트오더가 전부 섞여 있는
// 형식(숫자가 여러 개라 근접도로 골라야 함) 모두와 하위 호환된다.
function extractLabeledRange(text: string, keyword: RegExp): { start: string; end: string; matchedText: string } | null {
  for (const line of text.split('\n')) {
    const keywordMatch = line.match(keyword);
    if (!keywordMatch || keywordMatch.index === undefined) continue;
    const keywordIndex = keywordMatch.index;

    const rangeRegex = /(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})/g;
    let best: RegExpExecArray | null = null;
    let bestDistance = Infinity;
    let match: RegExpExecArray | null;
    while ((match = rangeRegex.exec(line)) !== null) {
      const distance = Math.abs(match.index - keywordIndex);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = match;
      }
    }
    if (best) return { start: best[1], end: best[2], matchedText: best[0] };
  }
  return null;
}

function extractLabeledTime(text: string, keyword: RegExp): string | null {
  for (const line of text.split('\n')) {
    const keywordMatch = line.match(keyword);
    if (!keywordMatch || keywordMatch.index === undefined) continue;
    const keywordIndex = keywordMatch.index;

    const timeRegex = /(\d{1,2}:\d{2})/g;
    let best: RegExpExecArray | null = null;
    let bestDistance = Infinity;
    let match: RegExpExecArray | null;
    while ((match = timeRegex.exec(line)) !== null) {
      const distance = Math.abs(match.index - keywordIndex);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = match;
      }
    }
    if (best) return best[1];
  }
  return null;
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

// [실사용 버그 제보](2026-09-02): 배달앱/홈페이지 메뉴판을 그대로 긁어 붙여넣으면 흔히
// "이름" / (빈 줄) / "가격만 단독으로 있는 줄" / (빈 줄) / "설명" 처럼 한 항목이 여러
// 줄에 걸쳐 나뉜다(실측 제보 원문: "하노이 쌀국수" / "12,000원" / "24시간 우린 진한
// 육수에..." 순서로 세 줄씩 반복). 위 MENU_LINE(한 줄짜리 "이름 가격") 형식과는 완전히
// 다른 모양이라 기존 정규식이 단 한 줄도 못 건졌다. 가격만 있는 줄을 이 패턴으로 별도
// 인식한다.
const PRICE_ONLY_LINE = /^([\d,]+)\s*원?$/;

// menu_items 스키마(scripts/migrations/2026-09-01-create-spot-curations-table.sql)가
// { name, price }만 저장하도록 이미 확정돼 있어(설명 컬럼 없음), 설명 줄은 의도적으로
// 버린다 — 스키마를 임의로 바꾸지 않는다(제5장 제3조).
export function parseMenuText(text: string): ParsedMenuItem[] {
  const lines = (text ?? '').split('\n');
  const items: ParsedMenuItem[] = [];
  // 그룹 형식("이름" 줄 다음 "가격" 단독 줄)을 지원하기 위해, 가격이 아닌 텍스트 줄을
  // 볼 때마다 "다음 가격의 후보 이름"으로 계속 갱신해 둔다 — 설명 줄은 항상 가격 *다음*에
  // 오는 순서라(이름 → 가격 → 설명), 가격을 찾은 직후 후보를 비워두면 그 뒤에 나오는
  // 설명 줄이 다음 이름 자리를 잘못 차지하는 일이 없다(다음 진짜 이름 줄이 나오면 다시
  // 덮어써진다).
  let pendingName: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 기존 단일 줄 형식("이름 가격원")이 그 자리에서 완성되면 즉시 항목으로 확정한다.
    const combinedMatch = trimmed.match(MENU_LINE);
    if (combinedMatch) {
      const name = combinedMatch[1].trim();
      const price = Number(combinedMatch[2].replace(/,/g, ''));
      if (name && Number.isFinite(price)) items.push({ name, price });
      pendingName = null;
      continue;
    }

    // 신규 그룹 형식: 가격만 단독으로 있는 줄을 만나면, 바로 직전에 본 텍스트 줄을
    // 이름으로 확정해 항목을 완성한다.
    const priceOnlyMatch = trimmed.match(PRICE_ONLY_LINE);
    if (priceOnlyMatch) {
      const price = Number(priceOnlyMatch[1].replace(/,/g, ''));
      if (pendingName && Number.isFinite(price)) items.push({ name: pendingName, price });
      pendingName = null;
      continue;
    }

    // 이름 또는 설명 후보 — 다음 가격 줄과 짝지어질 이름으로 갱신해 둔다.
    pendingName = trimmed;
  }

  return items;
}
