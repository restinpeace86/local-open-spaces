// [문화센터 통합 화면 — 연령 표시](2026-10-06, project/decision-log.md
// Decision 028): culture_club_classes.min_age_months/max_age_months(이미
// 개월 수로 정규화된 공통 컬럼, scripts/ingest/lib/age-range-parser.mjs)를
// 사람이 읽을 수 있는 문구로 되돌린다. 기존 화면은 이마트는 연령을 전혀
// 보여주지 않았고 롯데마트만 원문(age_range_text)을 그대로 보여줬는데,
// 이제 두 브랜드 다 같은 컬럼이 있으니 통합 화면에서는 둘 다 보여준다.
//
// [36개월 기준으로 단위 전환] 3세(36개월) 미만은 "개월" 단위가 더 직관적이고
// (예: "8~15개월"), 그 이상은 "세" 단위가 더 흔하다 — 정확한 변환이 아니라
// 표시용 근사(12개월=1세로 내림)다. 정밀한 월 단위 비교는 여전히 min/
// max_age_months 숫자 자체로 한다(이 함수는 화면 표시 전용).
// 범위 양끝에 서로 다른 단위를 섞어 쓰면("30개월~3세") 어색하므로, 상한
// (더 구체적인 쪽)을 기준으로 전체 범위의 단위를 하나로 정한다.
function formatInUnit(months: number, useMonthUnit: boolean): string {
  return useMonthUnit ? `${months}개월` : `${Math.floor(months / 12)}세`;
}

export function formatAgeRangeMonths(minAgeMonths: number | null, maxAgeMonths: number | null): string | null {
  if (minAgeMonths == null && maxAgeMonths == null) return null;

  const referenceMonths = maxAgeMonths ?? minAgeMonths ?? 0;
  const useMonthUnit = referenceMonths < 36;

  if (minAgeMonths != null && maxAgeMonths != null) {
    if (minAgeMonths === maxAgeMonths) return formatInUnit(minAgeMonths, useMonthUnit);
    return `${formatInUnit(minAgeMonths, useMonthUnit)}~${formatInUnit(maxAgeMonths, useMonthUnit)}`;
  }
  if (minAgeMonths != null) return `${formatInUnit(minAgeMonths, useMonthUnit)} 이상`;
  return `${formatInUnit(maxAgeMonths as number, useMonthUnit)} 이하`;
}
