// [아이 연령 기본 필터](2026-10-07 사용자 지시, project/decision-log.md
// Decision 028 연장): "온보딩때 입력한 아이 년생을 기준으로 데이터 가져올
// 꺼야 ... 이 기준에 부합하는 데이터들만 보여줄꺼야" — culture_club_classes.
// min_age_months/max_age_months(양끝 다 null일 수도, 한쪽만 null일 수도
// 있는 범위)와 아이의 현재 개월 수가 겹치는 행만 남긴다.
//
// [연령 정보가 전혀 없는 행은 제외한다] "이 기준에 부합하는 것만"이라는
// 사용자 표현을 문자 그대로 따른다 — min/max가 둘 다 null이면 그 강좌가
// 아이 나이에 맞는지 확인할 근거 자체가 없으므로(추측 금지, 제3장 제5조)
// 포함하지 않는다. 열린 범위("36개월 이상"처럼 한쪽만 null)는 그 방향으로는
// 무제한이라는 뜻이라 반대쪽 경계만 비교하면 된다.
export function buildAgeOverlapFilter(ageMonths: number): string {
  return [
    `and(min_age_months.lte.${ageMonths},max_age_months.gte.${ageMonths})`,
    `and(min_age_months.lte.${ageMonths},max_age_months.is.null)`,
    `and(min_age_months.is.null,max_age_months.gte.${ageMonths})`,
  ].join(',');
}
