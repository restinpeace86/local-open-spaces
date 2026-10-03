// [문화센터 탭](2026-10-03 사용자 지시): "브랜드 선택 — 최상단에서 브랜드 전환(예: 이마트
// 컬처클럽 등). 현재는 이마트컬처클럽밖에 없지만 추후 현대백화점이라던가 데이터도 가져올
// 생각." 지금은 1개뿐이라 별도 DB 테이블을 만들지 않고(제5장 제7조 — 확장 구조는 허용하되
// 확장 기능 자체를 구현하지 않음) 배열 1개짜리 상수로 둔다. 브랜드가 실제로 늘어나면
// 원소만 추가한다.
export const CULTURE_CLUB_BRAND_OPTIONS = [{ key: 'emart', label: '이마트 컬처클럽' }] as const;

export type CultureClubBrandKey = (typeof CULTURE_CLUB_BRAND_OPTIONS)[number]['key'];

// [카테고리 필터 — 실측 확인](2026-10-03): emart_culture_club_classes.sub_category_name의
// 실제 값은 정확히 이 5개뿐이다(전부 영문 — 사용자가 예시로 든 "오감/미술"은 실제 컬럼 값이
// 아니라 일러스트용 예시였던 것으로 보임, 추측으로 새 라벨을 지어내지 않고 실제 값을 그대로
// 쓴다. 제3장 제5조).
export const CULTURE_CLUB_SUB_CATEGORY_OPTIONS = [
  'Club Originals',
  'With Mom',
  'With mom(event)',
  'Kids & Children',
  'Kids & Children(event)',
] as const;

export type CultureClubSubCategory = (typeof CULTURE_CLUB_SUB_CATEGORY_OPTIONS)[number];

// [요일 필터] emart_culture_club_classes.class_day(text[])의 실제 값 표기와 동일한 한 글자
// 한글 요일(실측: ['금'] 등).
export const CULTURE_CLUB_DAY_OPTIONS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export type CultureClubDay = (typeof CULTURE_CLUB_DAY_OPTIONS)[number];
