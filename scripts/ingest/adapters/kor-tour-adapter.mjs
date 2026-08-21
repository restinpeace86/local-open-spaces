// KOR_SERVICE: 한국관광공사 국문 관광정보 서비스 (KorService2, B551011)
// data.go.kr 승인 계정으로 실제 호출 확인함 (areaBasedList2, resultCode 0000).
// KorPetTourService2/KorWithService2가 큐레이션해간 원본 마스터 DB로, 같은 contentid를
// 공유함을 실제 호출로 확인함 — TourApiV4AreaBasedAdapter가 contentid 기준으로 통합 매핑한다.
// 사용자 확인(2026-08-20)에 따라 contentTypeId 12(관광지)/14(문화시설)/28(레포츠)만 수집.
import { TourApiV4AreaBasedAdapter } from './lib/tour-api-v4-area-based-adapter.mjs';
import { UI_CATEGORY } from './lib/schema-mapper.mjs';

const CONTENT_TYPE_TO_UI_CATEGORY = {
  12: UI_CATEGORY.OUTDOOR_NATURE, // 관광지
  14: UI_CATEGORY.EXHIBITION_MUSEUM, // 문화시설
  28: UI_CATEGORY.KIDS_ACTIVITY, // 레포츠
};

export class KorTourAdapter extends TourApiV4AreaBasedAdapter {
  constructor({ detailContentTypeIds = [] } = {}) {
    super({
      sourceKey: 'KOR_SERVICE',
      serviceName: 'KorService2',
      contentTypeToCategory: CONTENT_TYPE_TO_UI_CATEGORY,
      detailContentTypeIds,
    });
  }
}
