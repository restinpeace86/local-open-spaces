import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/smart-seoul-map-client.mjs', () => ({
  fetchAllSmartSeoulMapContents: vi.fn(),
}));

const { SmartSeoulOkZoneAdapter, SMART_SEOUL_OK_ZONE_SERVICE_CATEGORY_ID, SMART_SEOUL_OK_ZONE_BADGE_KEY } = await import(
  './smart-seoul-ok-zone-adapter.mjs'
);
const { fetchAllSmartSeoulMapContents } = await import('../lib/smart-seoul-map-client.mjs');

const SAMPLE_ITEM = {
  COT_CONTS_ID: 'OK1',
  COT_CONTS_NAME: '산채향',
  COT_ADDR_FULL_NEW: '서울특별시 중구 청계천로 8',
  COT_COORD_X: 126.98,
  COT_COORD_Y: 37.567,
};

describe('SmartSeoulOkZoneAdapter', () => {
  beforeEach(() => {
    process.env.SMART_SEOUL_MAP_THEME_API_KEY = 'test-key';
    fetchAllSmartSeoulMapContents.mockReset();
  });

  afterEach(() => {
    delete process.env.SMART_SEOUL_MAP_THEME_API_KEY;
  });

  it('fetch()는 theme_id=1669595282433으로 콘텐츠를 조회한다', async () => {
    fetchAllSmartSeoulMapContents.mockResolvedValue([SAMPLE_ITEM]);
    const adapter = new SmartSeoulOkZoneAdapter();
    await adapter.fetch();
    expect(fetchAllSmartSeoulMapContents).toHaveBeenCalledWith('test-key', '1669595282433');
  });

  it('transform()은 신규 표준중분류/노출중분류(키즈친화 식당(오케이존))를 매긴다', () => {
    const adapter = new SmartSeoulOkZoneAdapter();
    const rows = adapter.transform([SAMPLE_ITEM]);
    expect(rows[0].category_min).toBe('키즈친화 식당(오케이존)');
    expect(rows[0].service_category_id).toBe(SMART_SEOUL_OK_ZONE_SERVICE_CATEGORY_ID);
  });

  it('badgeKey는 ok_zone_certified다', () => {
    const adapter = new SmartSeoulOkZoneAdapter();
    expect(adapter.badgeKey).toBe(SMART_SEOUL_OK_ZONE_BADGE_KEY);
  });
});
