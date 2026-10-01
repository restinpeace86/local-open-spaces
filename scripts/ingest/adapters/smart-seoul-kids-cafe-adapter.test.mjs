import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/smart-seoul-map-client.mjs', () => ({
  fetchAllSmartSeoulMapContents: vi.fn(),
}));

const { SmartSeoulKidsCafeAdapter, SMART_SEOUL_KIDS_CAFE_SERVICE_CATEGORY_ID, SMART_SEOUL_KIDS_CAFE_BADGE_KEY } = await import(
  './smart-seoul-kids-cafe-adapter.mjs'
);
const { fetchAllSmartSeoulMapContents } = await import('../lib/smart-seoul-map-client.mjs');
const { buildSmartSeoulMapExternalId } = await import('./lib/smart-seoul-map-transform.mjs');

const SAMPLE_ITEM = {
  COT_CONTS_ID: 'JG240301',
  COT_CONTS_NAME: '서울형 키즈카페 중구 중림동점',
  COT_ADDR_FULL_NEW: '서울특별시 중구 서소문로6길 16',
  COT_COORD_X: 126.96625,
  COT_COORD_Y: 37.55952,
};

describe('SmartSeoulKidsCafeAdapter', () => {
  beforeEach(() => {
    process.env.SMART_SEOUL_MAP_THEME_API_KEY = 'test-key';
    fetchAllSmartSeoulMapContents.mockReset();
  });

  afterEach(() => {
    delete process.env.SMART_SEOUL_MAP_THEME_API_KEY;
  });

  it('SMART_SEOUL_MAP_THEME_API_KEY가 없으면 에러를 던진다', () => {
    delete process.env.SMART_SEOUL_MAP_THEME_API_KEY;
    expect(() => new SmartSeoulKidsCafeAdapter()).toThrow('SMART_SEOUL_MAP_THEME_API_KEY');
  });

  it('fetch()는 theme_id=1679901034775로 콘텐츠를 조회한다', async () => {
    fetchAllSmartSeoulMapContents.mockResolvedValue([SAMPLE_ITEM]);
    const adapter = new SmartSeoulKidsCafeAdapter();
    await adapter.fetch();
    expect(fetchAllSmartSeoulMapContents).toHaveBeenCalledWith('test-key', '1679901034775');
  });

  it('transform()은 category_min=키즈카페, 노출중분류를 함께 매긴다', () => {
    const adapter = new SmartSeoulKidsCafeAdapter();
    const rows = adapter.transform([SAMPLE_ITEM]);
    expect(rows).toHaveLength(1);
    expect(rows[0].category_min).toBe('키즈카페');
    expect(rows[0].service_category_id).toBe(SMART_SEOUL_KIDS_CAFE_SERVICE_CATEGORY_ID);
    expect(rows[0].external_id).toBe(buildSmartSeoulMapExternalId('1679901034775', 'JG240301'));
  });

  it('badgeKey는 kc_seoul_type이고 transform 후 lastExternalIds가 채워진다', () => {
    const adapter = new SmartSeoulKidsCafeAdapter();
    expect(adapter.badgeKey).toBe(SMART_SEOUL_KIDS_CAFE_BADGE_KEY);
    adapter.transform([SAMPLE_ITEM]);
    expect(adapter.lastExternalIds).toEqual([buildSmartSeoulMapExternalId('1679901034775', 'JG240301')]);
  });
});
