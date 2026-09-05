// [노출 중분류 매핑/중복 스팟 검수 탭 분리](2026-09-05 사용자 지시): "중분류 매핑과
// 중복 스팟 검수 탭을 분리해라" — 분리 전에는 SpotDedupPanel 하나가 이 타입/상수를
// 소유했지만, 이제 두 탭(CategoryMappingPanel/SpotDedupPanel)이 각자 독립적으로
// service_categories를 조회하면서도 같은 모양을 다뤄야 해서 공유 파일로 뺀다(제5장
// 제4조 기존 구조 우선 — 두 파일에 타입을 복제하지 않음).
export type ServiceCategory = {
  id: string;
  parent_category: string;
  category_name: string;
};

// data-grid-client.tsx의 NULL_FILTER_TOKEN과 동일한 예약값 — "category_min이 없는
// (NULL) 행" 전체를 가리키는 선택지.
export const NULL_CATEGORY_MIN_TOKEN = '__NULL__';
