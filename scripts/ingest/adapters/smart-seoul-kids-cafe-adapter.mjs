// SMART_SEOUL_KIDS_CAFE: 스마트서울맵 '서울형 키즈카페'(theme_id=1679901034775)
//
// [2026-10-01 사용자 지시]: "표준중분류'키즈카페'에 이미 서울형키즈카페들이
// 있어.. 일단 키즈카페 이름으로 알수없으면 신규생성해주고 거기에 뱃지달아줘..
// 나중에 위치기반으로 중복스팟 검수및 병합하면될거같아" — 기존 소스들과 동일한
// 방식(external_id 기반 upsert)으로 그냥 신규 category_min='키즈카페' 행으로
// 수집하고, 중복 여부는 추측하지 않고 이번 세션 기존 수동 dedup 도구(관리자
// '중복 스팟 그룹핑 및 매핑')에 맡긴다. badgeKey로 "서울형키즈카페" 뱃지를
// run-smart-seoul-map.mjs가 수집 직후 함께 부여한다.
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { UI_CATEGORY } from './lib/schema-mapper.mjs';
import { transformSmartSeoulMapContent } from './lib/smart-seoul-map-transform.mjs';
import { fetchAllSmartSeoulMapContents } from '../lib/smart-seoul-map-client.mjs';

const THEME_ID = '1679901034775';
const SOURCE = 'smart_seoul_map';
export const SMART_SEOUL_KIDS_CAFE_SERVICE_CATEGORY_ID = 'fdb7161b-744c-45a2-b43d-c8556b82bada'; // 키즈카페 / 실내놀이터
export const SMART_SEOUL_KIDS_CAFE_BADGE_KEY = 'kc_seoul_type';

export class SmartSeoulKidsCafeAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SMART_SEOUL_KIDS_CAFE', targetTable: 'open_spaces', source: SOURCE });
    this.apiKey = process.env.SMART_SEOUL_MAP_THEME_API_KEY;
    if (!this.apiKey) throw new Error('SMART_SEOUL_MAP_THEME_API_KEY 환경변수가 설정되지 않았습니다.');
    this.badgeKey = SMART_SEOUL_KIDS_CAFE_BADGE_KEY;
    this.lastExternalIds = [];
  }

  async fetch() {
    return fetchAllSmartSeoulMapContents(this.apiKey, THEME_ID);
  }

  transform(rawItems) {
    const rows = rawItems
      .map((item) =>
        transformSmartSeoulMapContent(item, {
          themeId: THEME_ID,
          uiCategory: UI_CATEGORY.KIDS_ACTIVITY,
          categoryMin: '키즈카페',
          serviceCategoryId: SMART_SEOUL_KIDS_CAFE_SERVICE_CATEGORY_ID,
        })
      )
      .filter(Boolean);
    this.lastExternalIds = rows.map((r) => r.external_id);
    return rows;
  }
}
