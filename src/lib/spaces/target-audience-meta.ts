// [카드 표준 중분류/연령대상 표시](2026-08-27 사용자 지시): 상세보기에 연령대상을 사람이 읽을
// 수 있는 한글 라벨로 보여주기 위한 매핑. 실제로 이벤트픽 화면에 노출되는 이벤트는
// EVENT_PICK_TARGET_AUDIENCES(INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY) 4종으로만 좁혀져 있어
// 사용자가 지시한 4개 라벨(유아/미취학/초등학생 이상/가족)이 핵심이다. 그 외 값은 이 화면
// 경로로는 사실상 나타나지 않지만, target_audience 컬럼 자체는 10종 + OTHER까지 있어 방어적으로
// 전부 매핑해 둔다 — OTHER(수동 검수 대상)는 사용자에게 노출하기 부적절해 null(숨김)로 처리한다.
const TARGET_AUDIENCE_LABELS: Record<string, string> = {
  INFANT: '유아',
  KIDS_PRE: '미취학',
  KIDS_SCHOOL: '초등학생 이상',
  FAMILY: '가족',
  TEEN: '청소년',
  YOUTH: '청년',
  ADULT: '성인',
  SENIOR: '어르신',
  ALL: '전연령',
  FACILITY: '시설 대관(연령 무관)',
};

export function getTargetAudienceLabel(targetAudience: string | null | undefined): string | null {
  if (!targetAudience) return null;
  return TARGET_AUDIENCE_LABELS[targetAudience] ?? null;
}
