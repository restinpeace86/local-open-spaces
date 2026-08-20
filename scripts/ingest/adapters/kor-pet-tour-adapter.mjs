// KOR_PET_TOUR: 한국관광공사_반려동물 동반여행 서비스 (KorPetTourService2, B551011)
// data.go.kr 승인 계정으로 실제 호출 확인함 (areaBasedList2, resultCode 0000).
// 반려동물 동반여행 큐레이션 서비스라 전체 항목이 이미 pet-friendly 전제이며,
// 사용자 지시(2026-08-20)에 따라 contentTypeId 12(관광지)/14(문화시설)/28(레포츠)만 수집한다.
// 숙박(32)/음식점(39)/쇼핑(38)/축제공연행사(15)는 스코프 밖으로 제외.
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';

const BASE_URL = 'https://apis.data.go.kr/B551011/KorPetTourService2/areaBasedList2';
const PAGE_SIZE = 100;

// contentTypeId → UI 카테고리 (ai-rule.md 3.3 DB 원본 카테고리 매핑표와 동일한 대응 원칙 적용)
const CONTENT_TYPE_TO_UI_CATEGORY = {
  12: UI_CATEGORY.OUTDOOR_NATURE, // 관광지
  14: UI_CATEGORY.EXHIBITION_MUSEUM, // 문화시설
  28: UI_CATEGORY.KIDS_ACTIVITY, // 레포츠
};

export class KorPetTourAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'KOR_PET_TOUR', targetTable: 'open_spaces' });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  async fetchPage(contentTypeId, pageNo) {
    const params = new URLSearchParams({
      MobileOS: 'ETC',
      MobileApp: 'local-open-spaces',
      _type: 'json',
      arrange: 'C',
      contentTypeId: String(contentTypeId),
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
    });

    const url = `${BASE_URL}?serviceKey=${encodeURIComponent(this.apiKey)}&${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`KorPetTourService2 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`KorPetTourService2 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const header = json.response?.header;
    if (header?.resultCode !== '0000') {
      throw new Error(`KorPetTourService2 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const body = json.response?.body;
    const items = body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: body?.totalCount ?? 0,
    };
  }

  async fetchContentType(contentTypeId) {
    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while ((pageNo - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchPage(contentTypeId, pageNo);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageNo += 1;
    }

    return items;
  }

  async fetch() {
    const contentTypeIds = Object.keys(CONTENT_TYPE_TO_UI_CATEGORY).map(Number);
    const items = [];

    for (const contentTypeId of contentTypeIds) {
      const typeItems = await this.fetchContentType(contentTypeId);
      items.push(...typeItems);
    }

    return items;
  }

  transform(rawItems) {
    return rawItems
      .map((item) => {
        const lng = Number(item.mapx);
        const lat = Number(item.mapy);
        if (!item.contentid || !item.title || !lng || !lat) return null;

        const uiCategory = CONTENT_TYPE_TO_UI_CATEGORY[Number(item.contenttypeid)];

        return buildOpenSpaceRow({
          externalId: `KOR_PET_TOUR_${item.contentid}`,
          sourceType: 'KOR_PET_TOUR',
          name: item.title,
          uiCategory,
          address: item.addr1 || '',
          lng,
          lat,
          isFree: null, // 원본에 요금 정보 없음 — 임의 추정하지 않음
          infoUrl: null,
          rawData: item,
        });
      })
      .filter(Boolean);
  }
}
