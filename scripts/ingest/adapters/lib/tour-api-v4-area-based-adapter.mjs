// TourAPI 4.0 계열(B551011) 서비스 공통 베이스 — areaBasedList2 오퍼레이션으로
// 지역기반 관광정보를 contentTypeId별로 페이지네이션 수집해 open_spaces에 매핑한다.
// KorPetTourService2(반려동물 동반여행), KorWithService2(무장애 여행) 등 동일한
// 응답 스키마를 쓰는 서비스가 이 베이스를 상속한다 (제4조 기존 구조 우선 — 중복 방지).
import { BaseCollectorAdapter } from '../base-collector-adapter.mjs';
import { buildOpenSpaceRow } from './schema-mapper.mjs';

const PAGE_SIZE = 100;

export class TourApiV4AreaBasedAdapter extends BaseCollectorAdapter {
  constructor({ sourceKey, serviceName, contentTypeToCategory }) {
    super({ sourceKey, targetTable: 'open_spaces' });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    this.serviceName = serviceName;
    this.contentTypeToCategory = contentTypeToCategory;
    this.baseUrl = `https://apis.data.go.kr/B551011/${serviceName}/areaBasedList2`;
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

    const url = `${this.baseUrl}?serviceKey=${encodeURIComponent(this.apiKey)}&${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`${this.serviceName} 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${this.serviceName} 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const header = json.response?.header;
    if (header?.resultCode !== '0000') {
      throw new Error(`${this.serviceName} 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
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
    const contentTypeIds = Object.keys(this.contentTypeToCategory).map(Number);
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

        const uiCategory = this.contentTypeToCategory[Number(item.contenttypeid)];

        return buildOpenSpaceRow({
          externalId: `${this.sourceKey}_${item.contentid}`,
          sourceType: this.sourceKey,
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
