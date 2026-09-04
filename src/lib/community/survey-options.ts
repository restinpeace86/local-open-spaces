// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1·3-4: [설문형
// 스마트 리뷰 폼] 2단계 설문 문항 7종의 고정 선택지. checklist-items.ts와 동일한
// 근거로 하드코딩이 아니라 승인된 불변 구조 정의다(제5장 제6조가 금지하는 건
// "서비스 데이터"의 하드코딩이지, 사용자가 확정한 설문 문항 자체가 아니다).
// 모든 문항은 선택 사항이다(빈 배열/null 허용, 강제 응답 없음).

// [spec/community/mom-pick-grades.md 2.1] age_groups는 다른 문항과 달리 저장값
// 자체가 한글 리터럴이다 — 이 프로젝트의 기존 나이대 필드(target_age_group,
// personalization.ts의 ageToKidsAgeGroup)가 이미 '영유아'/'초등'/'전연령'처럼 한글
// 리터럴을 그대로 저장/비교하는 관례를 따른 것으로, key와 label을 분리할 필요가
// 없다.
export const AGE_GROUP_OPTIONS = [
  { key: '영유아', label: '영유아' },
  { key: '미취학', label: '미취학' },
  { key: '초등저', label: '초등 저학년' },
  { key: '초등고', label: '초등 고학년' },
] as const;
export type AgeGroupKey = (typeof AGE_GROUP_OPTIONS)[number]['key'];

export const VISIT_ENVIRONMENT_OPTIONS = [
  { key: 'outdoor', label: '☀️ 탁 트인 야외' },
  { key: 'indoor', label: '🏠 쾌적한 실내' },
  { key: 'mixed', label: '⛺ 복합' },
] as const;
export type VisitEnvironment = (typeof VISIT_ENVIRONMENT_OPTIONS)[number]['key'];

export const SATISFACTION_POINT_OPTIONS = [
  { key: 'parking', label: '주차 편리 🚗' },
  { key: 'stroller', label: '유모차 이동 수월 🦽' },
  { key: 'not_bored', label: '아이가 지루해하지 않음 🧸' },
  { key: 'good_value', label: '가성비 좋음 💳' },
] as const;
export type SatisfactionPointKey = (typeof SATISFACTION_POINT_OPTIONS)[number]['key'];

export const DURATION_TYPE_OPTIONS = [
  { key: 'short', label: '⏱️ 가볍게 산책/방문 (1~2시간)' },
  { key: 'half_day', label: '⏱️ 반나절 코스 (3~4시간)' },
  { key: 'full_day', label: '⏱️ 하루 종일 알차게 (종일)' },
] as const;
export type DurationType = (typeof DURATION_TYPE_OPTIONS)[number]['key'];

export const WEATHER_TAG_OPTIONS = [
  { key: 'rainy_day', label: '🌧️ 비 오는 날 가기 좋아요' },
  { key: 'hot_day', label: '☀️ 더위를 피하기 좋아요' },
  { key: 'mild_season', label: '🍂 가을/봄 날씨에 최고' },
  { key: 'energy_burn', label: '🛝 아이 에너지를 싹 빼기 좋아요' },
] as const;
export type WeatherTagKey = (typeof WEATHER_TAG_OPTIONS)[number]['key'];

export const INFRA_TAG_OPTIONS = [
  { key: 'nursing_room', label: '🍼 수유실/기저귀 갈이대가 잘 되어 있어요' },
  { key: 'food_available', label: '🍴 간단한 간식/식사를 해결할 수 있어요' },
  { key: 'clean_restroom', label: '🚽 화장실이 가깝고 깨끗해요' },
] as const;
export type InfraTagKey = (typeof INFRA_TAG_OPTIONS)[number]['key'];

export const COMPANION_TYPE_OPTIONS = [
  { key: 'family', label: '👨‍👩‍👧‍👦 엄마/아빠와 단둘이(또는 소가족)' },
  { key: 'friends_group', label: '👥 친구네 가족과 함께' },
] as const;
export type CompanionType = (typeof COMPANION_TYPE_OPTIONS)[number]['key'];

export type SurveyAnswers = {
  ageGroups: AgeGroupKey[];
  visitEnvironment: VisitEnvironment | null;
  satisfactionPoints: SatisfactionPointKey[];
  durationType: DurationType | null;
  weatherTags: WeatherTagKey[];
  infraTags: InfraTagKey[];
  companionType: CompanionType | null;
};

export function emptySurveyAnswers(): SurveyAnswers {
  return {
    ageGroups: [],
    visitEnvironment: null,
    satisfactionPoints: [],
    durationType: null,
    weatherTags: [],
    infraTags: [],
    companionType: null,
  };
}

// 옵션 key → label 조회(마이페이지 상세/피드 카드에서 저장된 값을 사람이 읽을 수
// 있는 문구로 되돌릴 때 재사용 — 같은 매핑을 여러 곳에서 다시 만들지 않는다).
function toLabelMap(options: readonly { key: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(options.map((o) => [o.key, o.label]));
}

export const AGE_GROUP_LABELS = toLabelMap(AGE_GROUP_OPTIONS);
export const VISIT_ENVIRONMENT_LABELS = toLabelMap(VISIT_ENVIRONMENT_OPTIONS);
export const SATISFACTION_POINT_LABELS = toLabelMap(SATISFACTION_POINT_OPTIONS);
export const DURATION_TYPE_LABELS = toLabelMap(DURATION_TYPE_OPTIONS);
export const WEATHER_TAG_LABELS = toLabelMap(WEATHER_TAG_OPTIONS);
export const INFRA_TAG_LABELS = toLabelMap(INFRA_TAG_OPTIONS);
export const COMPANION_TYPE_LABELS = toLabelMap(COMPANION_TYPE_OPTIONS);
