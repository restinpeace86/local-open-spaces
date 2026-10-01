// SMART_SEOUL_OK_ZONE: 스마트서울맵 '편한외출 서울키즈 오케이존'
// (theme_id=1669595282433)
//
// [2026-10-01 사용자 지시]: "표준중분류 어린이식당? 혹은 키즈친화식당으로
// 하나만들고.. 노출중분류도 키즈친화식당 하나 만들어.. 오케이존 인증 식당은
// 이쪽으로 다 매핑시켜주고 오케이존 인증 뱃지달아줘" → 기존 '키즈친화
// 식당(놀이시설 포함)'과 이름이 겹치지 않도록 "키즈친화 식당(오케이존)"으로
// 확정(AskUserQuestion). 실측(SUBCATE 9종: 한식/양식/중식/일식/경양식/제과/카페/
// 패스트푸드/아시아푸드) 결과 655건 전부 식당·카페류라 신규 표준중분류 +
// 신규 노출중분류로 분리하고, "오케이존 인증" 뱃지도 함께 부여한다.
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { UI_CATEGORY } from './lib/schema-mapper.mjs';
import { transformSmartSeoulMapContent } from './lib/smart-seoul-map-transform.mjs';
import { fetchAllSmartSeoulMapContents } from '../lib/smart-seoul-map-client.mjs';

const THEME_ID = '1669595282433';
const SOURCE = 'smart_seoul_map';
export const SMART_SEOUL_OK_ZONE_SERVICE_CATEGORY_ID = '3e668e85-d0d9-4e30-8dba-d11eed8469e9'; // 키즈친화 식당(오케이존)
export const SMART_SEOUL_OK_ZONE_BADGE_KEY = 'ok_zone_certified';

export class SmartSeoulOkZoneAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SMART_SEOUL_OK_ZONE', targetTable: 'open_spaces', source: SOURCE });
    this.apiKey = process.env.SMART_SEOUL_MAP_THEME_API_KEY;
    if (!this.apiKey) throw new Error('SMART_SEOUL_MAP_THEME_API_KEY 환경변수가 설정되지 않았습니다.');
    this.badgeKey = SMART_SEOUL_OK_ZONE_BADGE_KEY;
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
          categoryMin: '키즈친화 식당(오케이존)',
          serviceCategoryId: SMART_SEOUL_OK_ZONE_SERVICE_CATEGORY_ID,
        })
      )
      .filter(Boolean);
    this.lastExternalIds = rows.map((r) => r.external_id);
    return rows;
  }
}
