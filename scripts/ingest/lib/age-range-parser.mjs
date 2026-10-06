// [연령 표기 → 개월 수 정규화](2026-10-06 todo.md 개선사항 2): "이마트
// 컬처클럽과 롯데마트 문화센터의 강좌 데이터에서 제각각인 연령 표기를
// 파싱하여, 최종적으로 데이터베이스에 정형화된 정수 컬럼인 minAge/maxAge에
// '총 개월 수' 단위로 적재" — 2단계 파이프라인(①'세'/'년생'→출생연도 정규화,
// ②출생연도/개월 수→최종 개월 수 범위)을 요구했다.
//
// [실제 구현은 한 단계로 축약](실측 확인): 스펙이 예시로 든 "6~7세 →
// 2019~2020년생 → 72~84개월"을 그대로 따라가면, '세' 단위는 결국
// `나이 * 12`와 수학적으로 동일하다(기준연도-출생연도 = 나이이므로). 그래서
// 매 변(min쪽/max쪽) 값을 "그 변 자신의 단위"로 독립적으로 개월 수로
// 환산한 뒤 min/max를 취하는 한 단계 함수로 구현했다 — 스펙이 가정한
// "범위 전체가 같은 단위"뿐 아니라, 실제 수집된 이마트 강좌 제목에서 발견한
// 혼합 단위 사례("(40개월~21년생)" — 최소는 개월, 최대는 년생)도 특별
// 분기 없이 그대로 처리된다(추측으로 지어낸 패턴이 아니라 실데이터에서
// 확인한 패턴).
//
// [두 자리 '년생' 연도 보정] "(21~22년생)"처럼 끝 두 자리만 있는 경우,
// 자녀 연령대 서비스라는 맥락상 2000년대생이 압도적으로 많다 — 00~68은
// 2000년대, 69~99는 1900년대로 본다(전통적인 2자리 연도 윈도우 규칙, 2068년
// 까지 유효). 4자리(예: "2020~23년생"의 "2020")는 그대로 쓴다.
const RANGE_REGEX = /(\d{1,4})\s*(개월|세|년생)?\s*[~∼-]\s*(\d{1,4})\s*(개월|세|년생)/;
// [열린 범위](실측 확인: 기존 emart-culture-club.test.mjs 샘플 제목 "(36개월
// 이상)") — "이상"/"초과"는 하한만, "이하"/"미만"은 상한만 있고 반대쪽은
// 무제한(null)이다. 월 단위 원문에서 "초과"와 "이상", "미만"과 "이하"를
// 날짜 단위로 더 쪼개 구분할 근거가 없어(제3장 제5조) 각각 동일하게
// 취급한다 — 의도된 단순화다.
const OPEN_ENDED_REGEX = /(\d{1,4})\s*(개월|세|년생)\s*(이상|초과|이하|미만)/;
const SINGLE_REGEX = /(\d{1,4})\s*(개월|세|년생)/;

function normalizeBirthYear(value) {
  if (value >= 1000) return value;
  return value <= 68 ? 2000 + value : 1900 + value;
}

function sideToMonths(value, unit, referenceYear) {
  if (unit === '개월') return value;
  if (unit === '세') return value * 12;
  if (unit === '년생') return (referenceYear - normalizeBirthYear(value)) * 12;
  return null;
}

const EMPTY_RESULT = { minAgeMonths: null, maxAgeMonths: null };

export function parseAgeRangeToMonths(text, { referenceYear = new Date().getFullYear() } = {}) {
  if (!text) return EMPTY_RESULT;

  const rangeMatch = text.match(RANGE_REGEX);
  if (rangeMatch) {
    const [, v1, u1, v2, u2] = rangeMatch;
    const unit1 = u1 || u2;
    const m1 = sideToMonths(Number(v1), unit1, referenceYear);
    const m2 = sideToMonths(Number(v2), u2, referenceYear);
    if (m1 == null || m2 == null) return EMPTY_RESULT;
    return { minAgeMonths: Math.min(m1, m2), maxAgeMonths: Math.max(m1, m2) };
  }

  const openEndedMatch = text.match(OPEN_ENDED_REGEX);
  if (openEndedMatch) {
    const [, v, u, modifier] = openEndedMatch;
    const months = sideToMonths(Number(v), u, referenceYear);
    if (months == null) return EMPTY_RESULT;
    return modifier === '이상' || modifier === '초과'
      ? { minAgeMonths: months, maxAgeMonths: null }
      : { minAgeMonths: null, maxAgeMonths: months };
  }

  const singleMatch = text.match(SINGLE_REGEX);
  if (singleMatch) {
    const [, v, u] = singleMatch;
    const months = sideToMonths(Number(v), u, referenceYear);
    if (months == null) return EMPTY_RESULT;
    return { minAgeMonths: months, maxAgeMonths: months };
  }

  return EMPTY_RESULT;
}
