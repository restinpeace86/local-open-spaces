// KOR_WITH_TOUR: 한국관광공사_무장애 여행 정보 서비스 (KorWithService2, B551011)
// data.go.kr 승인 계정으로 실제 호출 확인함 (areaBasedList2, resultCode 0000).
// KorPetTourAdapter와 동일한 스코프 결정(사용자 확인, 2026-08-20)을 그대로 적용:
// contentTypeId 12(관광지)/14(문화시설)/28(레포츠)만 수집, 숙박/음식점/쇼핑/축제공연행사는 제외.
import { TourApiV4AreaBasedAdapter } from './lib/tour-api-v4-area-based-adapter.mjs';
import { UI_CATEGORY } from './lib/schema-mapper.mjs';

const CONTENT_TYPE_TO_UI_CATEGORY = {
  12: UI_CATEGORY.OUTDOOR_NATURE, // 관광지
  14: UI_CATEGORY.EXHIBITION_MUSEUM, // 문화시설
  28: UI_CATEGORY.KIDS_ACTIVITY, // 레포츠
};

export class KorWithTourAdapter extends TourApiV4AreaBasedAdapter {
  constructor({ detailContentTypeIds = [] } = {}) {
    super({
      sourceKey: 'KOR_WITH_TOUR',
      serviceName: 'KorWithService2',
      contentTypeToCategory: CONTENT_TYPE_TO_UI_CATEGORY,
      detailContentTypeIds,
    });
  }
}
