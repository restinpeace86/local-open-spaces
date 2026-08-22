// NATIONAL_PARK_ECOTOUR: 국립공원공단_국립공원 생태관광정보 DB (odcloud.kr)
// data.go.kr 승인 계정으로 실제 호출 확인함 (Swagger: infuser.odcloud.kr/oas/docs?namespace=3068312/v1).
// 원본 응답에 좌표가 없어(서비스 지역이 "강원도 속초"처럼 텍스트로만 제공됨) 지오코딩으로 보완한다.
// Task 9-2-1(2026-08-22): KAKAO_REST_API_KEY가 계속 미설정이라 이 어댑터만 유일하게 막혀
// 있었다(실측 확인) — VWORLD_API_KEY는 이미 다른 어댑터에서 정상 동작 중이라(예:
// cultural-facility-summary-adapter.mjs), 다른 코드는 그대로 두고 지오코더만 vworld로
// 교체한다. "강원도 속초"/"강원도 원주시 소초면 학곡리 900번지" 등 실제 원본 값으로 직접
// 호출해 VWorld가 정상 좌표를 반환함을 확인했다(일부 "OO국립공원"처럼 도로명/지번이 아닌
// 값은 VWorld가 못 찾을 수 있으나, 기존과 동일하게 그 항목만 건너뛴다 — 추측 좌표 생성 없음).
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { geocode, hasVworldApiKey } from './lib/vworld-geocoder.mjs';
import { deriveIsFreeFallback } from '../lib/ai-tagging.mjs';

const BASE_URL =
  'https://api.odcloud.kr/api/3068312/v1/uddi:d529eac9-fcbb-468a-81f8-eacb1d9568e2_201808161131';
const PAGE_SIZE = 100;

export class NationalParkEcotourAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'NATIONAL_PARK_ECOTOUR', targetTable: 'open_spaces' });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    if (!hasVworldApiKey()) {
      throw new Error(
        'VWORLD_API_KEY 환경변수가 설정되지 않았습니다. 원본 데이터에 좌표가 없어 지오코딩이 필수입니다. Vworld 오픈API(www.vworld.kr) 신청 후 .env.local에 추가하세요.'
      );
    }
  }

  async fetchPage(page) {
    const url = `${BASE_URL}?page=${page}&perPage=${PAGE_SIZE}&serviceKey=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok) {
      throw new Error(`odcloud API 오류 (HTTP ${res.status}): ${json?.msg ?? JSON.stringify(json).slice(0, 200)}`);
    }

    return json;
  }

  async fetch() {
    const items = [];
    let page = 1;
    let totalCount = Infinity;

    while ((page - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchPage(page);
      totalCount = result.totalCount ?? 0;
      items.push(...(result.data ?? []));
      page += 1;
    }

    return items;
  }

  // 지오코딩은 비동기 네트워크 호출이라 base의 동기 transform()과 별도로 오버라이드한다.
  async transform(rawItems) {
    const rows = [];

    for (const item of rawItems) {
      const name = item['프로그램명'];
      const region = item['서비스 지역']?.trim();
      const intro = item['프로그램 소개'] || item['프로그램 상세 소개'] || null;

      if (!name || !region) continue;

      // "강원도 속초, 양양, 고성"처럼 여러 지역이 콤마로 나열된 경우 첫 지역만 대표 좌표로 사용
      const primaryRegion = region.split(',')[0].trim();

      let coords = null;
      try {
        coords = await geocode(primaryRegion);
      } catch (err) {
        console.warn(`⚠️ 지오코딩 실패 [${name}] "${primaryRegion}": ${err.message}`);
        continue;
      }

      if (!coords) {
        console.warn(`⚠️ 지오코딩 결과 없음 [${name}] "${primaryRegion}" — 건너뜀`);
        continue;
      }

      const hash = crypto.createHash('sha1').update(`${name}|${region}`).digest('hex').slice(0, 16);

      const row = buildOpenSpaceRow({
        externalId: `NATIONAL_PARK_ECOTOUR_${hash}`,
        sourceType: 'NATIONAL_PARK_ECOTOUR',
        name,
        uiCategory: UI_CATEGORY.EXPERIENCE_CLASS,
        address: region,
        lng: coords.lng,
        lat: coords.lat,
        // ai-rule.md 5.2-7 Fallback: 이 소스는 국립공원공단(공공기관)이 직접 운영하는
        // 생태관광 프로그램 전체를 다루며 민간 시설이 섞여 있지 않으므로(다른 관광 API와
        // 달리 운영주체가 확정적) 요금 정보 부재 시 무료로 기본 추정한다.
        isFree: deriveIsFreeFallback({ hasFeeInfo: false, isPublicProvider: true }),
        infoUrl: null,
        facilityType: '야외',
        rawData: { ...item, _geocoded_from: primaryRegion },
      });

      if (row) rows.push(row);
    }

    return rows;
  }
}
