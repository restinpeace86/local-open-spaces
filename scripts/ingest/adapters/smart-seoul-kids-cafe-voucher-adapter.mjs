// SMART_SEOUL_KIDS_CAFE_VOUCHER: 스마트서울맵 '서울형키즈카페머니 사용처'
// (theme_id=1693879047939)
//
// [2026-10-01 사용자 지시]: "키즈카페머니 사용처가 따로 있는게 아니고 키즈카페의
// 뱃지로 있는게 맞는거 같아.. 맞는 키즈카페없으면 키즈카페쪽에 새로 등록하고
// 뱃지달고" — SMART_SEOUL_KIDS_CAFE_ADAPTER와 동일하게 category_min='키즈카페'로
// 수집하고, badgeKey "키즈카페머니 사용가능"을 함께 부여한다. 테마만 다르고
// 변환/적재 로직은 완전히 동일하다.
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { UI_CATEGORY } from './lib/schema-mapper.mjs';
import { transformSmartSeoulMapContent } from './lib/smart-seoul-map-transform.mjs';
import { fetchAllSmartSeoulMapContents } from '../lib/smart-seoul-map-client.mjs';
import { SMART_SEOUL_KIDS_CAFE_SERVICE_CATEGORY_ID } from './smart-seoul-kids-cafe-adapter.mjs';

const THEME_ID = '1693879047939';
const SOURCE = 'smart_seoul_map';
export const SMART_SEOUL_KIDS_CAFE_VOUCHER_BADGE_KEY = 'kc_voucher_accepted';

export class SmartSeoulKidsCafeVoucherAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SMART_SEOUL_KIDS_CAFE_VOUCHER', targetTable: 'open_spaces', source: SOURCE });
    this.apiKey = process.env.SMART_SEOUL_MAP_THEME_API_KEY;
    if (!this.apiKey) throw new Error('SMART_SEOUL_MAP_THEME_API_KEY 환경변수가 설정되지 않았습니다.');
    this.badgeKey = SMART_SEOUL_KIDS_CAFE_VOUCHER_BADGE_KEY;
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
