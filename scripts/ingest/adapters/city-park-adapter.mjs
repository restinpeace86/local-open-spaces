// CITY_PARK: 전국 도시공원 정보 표준데이터 (data.go.kr, tn_pubr_public_cty_park_info_api)
// 레거시 scripts/ingest/city-parks.mjs를 BaseCollectorAdapter 구조로 마이그레이션한 버전.
// 응답 필드(manageNo/parkNm/rdnmadr/lnmadr/latitude/longitude 등)는 레거시 스크립트가 이미
// 실 API 호출로 검증해 사용하던 값 그대로이며, --dry-run 재호출로도 동일 필드를 재확인했다.
//
// external_id는 레거시와 동일하게 `CITY_PARK_${manageNo}`를 유지해 기존 upsert 데이터와의
// 연속성을 보장한다(manageNo는 지자체별 공원 고유 관리번호로 시설별 고유값임을 확인함).
//
// spec/data/ai-rule.md 3.1은 `PARK`(근린공원/어린이공원/수변공원 등)을 open_spaces 원본
// 카테고리로 정의하고, 3.3 매핑표는 `PARK`을 UI 카테고리 🌳 야외·자연(OUTDOOR_NATURE)으로 묶는다.
//
// 도시공원은 지자체가 관리하는 공공 공원으로 전량 무료 이용 시설이라 레거시와 동일하게
// is_free=true를 고정값으로 사용한다(원본에 별도 요금 필드가 없음).
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { deriveParentalTags } from '../lib/ai-tagging.mjs';

const BASE_URL = 'http://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api';
const PAGE_SIZE = 100;
const SOURCE = 'city_park';

export class CityParkAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'CITY_PARK', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. manageNo가 external_id 구성에도 쓰이는
  // 지자체별 공원 고유 관리번호라 그대로 재사용한다.
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems.filter((item) => item.manageNo).map((item) => ({ sourceId: item.manageNo, payload: item }));
  }

  async fetchPage(pageNo) {
    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      type: 'json',
    });

    const url = `${BASE_URL}?${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`CityPark 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`CityPark 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    if (json.header?.resultCode !== '00') {
      throw new Error(`CityPark 에러 응답: ${json.header?.resultCode} ${json.header?.resultMsg}`);
    }

    const items = json.body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: Number(json.body?.totalCount ?? 0),
    };
  }

  async fetch() {
    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while ((pageNo - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchPage(pageNo);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageNo += 1;
    }

    return items;
  }

  // eslint-disable-next-line class-methods-use-this
  transform(rawItems) {
    return rawItems
      .map((item) => {
        const name = item.parkNm;
        const address = item.rdnmadr || item.lnmadr || '';
        const lng = Number(item.longitude);
        const lat = Number(item.latitude);

        if (!name || !item.manageNo || !lng || !lat) return null;

        // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트(주요시설/안내 등)를 근거로만 태깅한다.
        const tags = deriveParentalTags(JSON.stringify(item));

        return buildOpenSpaceRow({
          externalId: `CITY_PARK_${item.manageNo}`,
          sourceType: 'CITY_PARK',
          source: SOURCE,
          name,
          uiCategory: UI_CATEGORY.OUTDOOR_NATURE,
          address,
          lng,
          lat,
          isFree: true,
          operatingHours: null,
          infoUrl: null,
          facilityType: tags.facility_type,
          isKidsFriendly: tags.is_kids_friendly,
          hasParking: tags.has_parking,
          strollerAccessible: tags.stroller_accessible,
          targetAgeGroup: tags.target_age_group,
          rawData: item,
        });
      })
      .filter(Boolean);
  }
}
