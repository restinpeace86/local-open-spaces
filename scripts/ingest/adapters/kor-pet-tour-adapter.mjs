// KOR_PET_TOUR: 한국관광공사_반려동물 동반여행 서비스 (KorPetTourService2, B551011)
// data.go.kr 승인 계정으로 실제 호출 확인함 (areaBasedList2, resultCode 0000).
// 반려동물 동반여행 큐레이션 서비스라 전체 항목이 이미 pet-friendly 전제이며,
// 사용자 지시(2026-08-20)에 따라 contentTypeId 12(관광지)/14(문화시설)/28(레포츠)만 수집한다.
// 숙박(32)/음식점(39)/쇼핑(38)/축제공연행사(15)는 스코프 밖으로 제외.
import { TourApiV4AreaBasedAdapter } from './lib/tour-api-v4-area-based-adapter.mjs';
import { UI_CATEGORY } from './lib/schema-mapper.mjs';

// contentTypeId → UI 카테고리 (ai-rule.md 3.3 DB 원본 카테고리 매핑표와 동일한 대응 원칙 적용)
const CONTENT_TYPE_TO_UI_CATEGORY = {
  12: UI_CATEGORY.OUTDOOR_NATURE, // 관광지
  14: UI_CATEGORY.EXHIBITION_MUSEUM, // 문화시설
  28: UI_CATEGORY.KIDS_ACTIVITY, // 레포츠
};

export class KorPetTourAdapter extends TourApiV4AreaBasedAdapter {
  constructor({ detailContentTypeIds = [] } = {}) {
    super({
      sourceKey: 'KOR_PET_TOUR',
      serviceName: 'KorPetTourService2',
      contentTypeToCategory: CONTENT_TYPE_TO_UI_CATEGORY,
      detailContentTypeIds,
    });
  }
}
