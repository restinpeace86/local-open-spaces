// GO_CAMPING: 한국관광공사_고캠핑 정보 서비스 (GoCamping, B551011)
// data.go.kr 승인 계정으로 실제 호출 확인함 (basedList, resultCode 0000, 총 3,097건).
// TourAPI 4.0 계열(KorXxxService2)과 응답 필드명 체계가 달라(contentId/facltNm/mapX 등
// 카멜케이스, areaBasedList2가 아닌 basedList) 별도 어댑터로 구현한다.
// 캠핑장은 정의상 전부 야외 시설이므로 contentTypeId 분기 없이 전 항목을 OUTDOOR_NATURE로 매핑.
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';

const BASE_URL = 'https://apis.data.go.kr/B551011/GoCamping/basedList';
const PAGE_SIZE = 100;
const SOURCE = 'tourapi_4.0';

export class GoCampingAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'GO_CAMPING', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. contentId가 external_id 구성에도 쓰이는
  // TourAPI 계열 공통 고유 콘텐츠 ID다.
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems.filter((item) => item.contentId).map((item) => ({ sourceId: String(item.contentId), payload: item }));
  }

  async fetchPage(pageNo) {
    const params = new URLSearchParams({
      MobileOS: 'ETC',
      MobileApp: 'local-open-spaces',
      _type: 'json',
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
    });

    const url = `${BASE_URL}?serviceKey=${encodeURIComponent(this.apiKey)}&${params.toString()}`;
    const res = await fetchWithTimeout(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`GoCamping 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GoCamping 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const header = json.response?.header;
    if (header?.resultCode !== '0000') {
      throw new Error(`GoCamping 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const body = json.response?.body;
    const items = body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: body?.totalCount ?? 0,
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

  transform(rawItems) {
    return rawItems
      .map((item) => {
        const lng = Number(item.mapX);
        const lat = Number(item.mapY);
        if (!item.contentId || !item.facltNm || !lng || !lat) return null;

        return buildOpenSpaceRow({
          externalId: `GO_CAMPING_${item.contentId}`,
          sourceType: 'GO_CAMPING',
          source: SOURCE,
          name: item.facltNm,
          uiCategory: UI_CATEGORY.OUTDOOR_NATURE,
          address: item.addr1 || '',
          lng,
          lat,
          // 캠핑장은 공공/민간 운영이 혼재하고 원본에 운영주체를 판별할 필드가 없어
          // ai-rule.md 5.2-7 Fallback(국공립 확정 시 무료 추정) 대상이 아님 — null 유지(추측 금지)
          isFree: null,
          infoUrl: item.resveUrl || item.homepage || null,
          facilityType: '야외', // 캠핑장은 정의상 야외 시설
          rawData: item,
        });
      })
      .filter(Boolean);
  }
}
