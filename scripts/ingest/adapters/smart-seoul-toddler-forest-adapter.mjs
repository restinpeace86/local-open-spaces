// SMART_SEOUL_TODDLER_FOREST: 스마트서울맵 '서울, 유아숲 체험시설'
// (theme_id=100361)
//
// [2026-10-01 사용자 지시]: "서울, 유아숲 체험시설은 신규로 따고 음 뱃지는
// 안달아도되려나?" → 독자적 신규 표준중분류('유아숲체험원')라 다른 4개 테마와
// 달리 badgeKey가 없다(표준중분류 자체가 이미 식별 정보를 담고 있어 뱃지로
// 중복 표시할 필요가 없다는 판단, 사용자 확인).
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { UI_CATEGORY } from './lib/schema-mapper.mjs';
import { transformSmartSeoulMapContent } from './lib/smart-seoul-map-transform.mjs';
import { fetchAllSmartSeoulMapContents } from '../lib/smart-seoul-map-client.mjs';

const THEME_ID = '100361';
const SOURCE = 'smart_seoul_map';
export const SMART_SEOUL_TODDLER_FOREST_SERVICE_CATEGORY_ID = '7256ef32-35a0-45fe-b421-8ae6851deaae'; // 유아숲체험원

export class SmartSeoulToddlerForestAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SMART_SEOUL_TODDLER_FOREST', targetTable: 'open_spaces', source: SOURCE });
    this.apiKey = process.env.SMART_SEOUL_MAP_THEME_API_KEY;
    if (!this.apiKey) throw new Error('SMART_SEOUL_MAP_THEME_API_KEY 환경변수가 설정되지 않았습니다.');
    this.badgeKey = null; // 뱃지 없음 — 위 코멘트 참고
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
          uiCategory: UI_CATEGORY.OUTDOOR_NATURE,
          categoryMin: '유아숲체험원',
          serviceCategoryId: SMART_SEOUL_TODDLER_FOREST_SERVICE_CATEGORY_ID,
        })
      )
      .filter(Boolean);
    this.lastExternalIds = rows.map((r) => r.external_id);
    return rows;
  }
}
