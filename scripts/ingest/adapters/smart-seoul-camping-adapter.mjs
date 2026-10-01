// SMART_SEOUL_CAMPING: 스마트서울맵 '서울로 떠나는 캠핑'(theme_id=100200)
//
// [2026-10-01 사용자 지시]: "서울로 떠나는 캠핑은 기존 캠핑장 재사용하고..
// 노출중분류도 있으니깐 기존 재사용하고 이것도 뱃지형식으로 '서울형캠핑장'
// 이렇게 달자" — 기존 category_min='캠핑장' + 기존 노출중분류 '캠핑장 /
// 피크닉장'을 그대로 쓰고 "서울형캠핑장" 뱃지만 추가한다.
//
// [반경 주의] 이 테마는 전국 단위 콘텐츠를 포함한다(실측: 함평/봉화/제천 등
// 최대 약 250km 거리) — smart-seoul-map-client.mjs의 기본 반경(300km)이 이
// 사례를 근거로 정해졌다(해당 파일 주석 참고).
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { UI_CATEGORY } from './lib/schema-mapper.mjs';
import { transformSmartSeoulMapContent } from './lib/smart-seoul-map-transform.mjs';
import { fetchAllSmartSeoulMapContents } from '../lib/smart-seoul-map-client.mjs';

const THEME_ID = '100200';
const SOURCE = 'smart_seoul_map';
export const SMART_SEOUL_CAMPING_SERVICE_CATEGORY_ID = '66c59da9-159a-4b83-895b-8e2d015e8c30'; // 캠핑장 / 피크닉장
export const SMART_SEOUL_CAMPING_BADGE_KEY = 'CAMPING_SEOUL_OPERATED';

export class SmartSeoulCampingAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SMART_SEOUL_CAMPING', targetTable: 'open_spaces', source: SOURCE });
    this.apiKey = process.env.SMART_SEOUL_MAP_THEME_API_KEY;
    if (!this.apiKey) throw new Error('SMART_SEOUL_MAP_THEME_API_KEY 환경변수가 설정되지 않았습니다.');
    this.badgeKey = SMART_SEOUL_CAMPING_BADGE_KEY;
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
          categoryMin: '캠핑장',
          serviceCategoryId: SMART_SEOUL_CAMPING_SERVICE_CATEGORY_ID,
        })
      )
      .filter(Boolean);
    this.lastExternalIds = rows.map((r) => r.external_id);
    return rows;
  }
}
