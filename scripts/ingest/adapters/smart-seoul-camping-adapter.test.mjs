import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/smart-seoul-map-client.mjs', () => ({
  fetchAllSmartSeoulMapContents: vi.fn(),
}));

const { SmartSeoulCampingAdapter, SMART_SEOUL_CAMPING_SERVICE_CATEGORY_ID, SMART_SEOUL_CAMPING_BADGE_KEY } = await import(
  './smart-seoul-camping-adapter.mjs'
);
const { fetchAllSmartSeoulMapContents } = await import('../lib/smart-seoul-map-client.mjs');

const SAMPLE_ITEM = {
  COT_CONTS_ID: 'C1',
  COT_CONTS_NAME: '난지 캠핑장',
  COT_ADDR_FULL_NEW: '서울특별시 마포구 한강난지로 28',
  COT_COORD_X: 126.872,
  COT_COORD_Y: 37.5698,
};

describe('SmartSeoulCampingAdapter', () => {
  beforeEach(() => {
    process.env.SMART_SEOUL_MAP_THEME_API_KEY = 'test-key';
    fetchAllSmartSeoulMapContents.mockReset();
  });

  afterEach(() => {
    delete process.env.SMART_SEOUL_MAP_THEME_API_KEY;
  });

  it('fetch()는 theme_id=100200으로 콘텐츠를 조회한다', async () => {
    fetchAllSmartSeoulMapContents.mockResolvedValue([SAMPLE_ITEM]);
    const adapter = new SmartSeoulCampingAdapter();
    await adapter.fetch();
    expect(fetchAllSmartSeoulMapContents).toHaveBeenCalledWith('test-key', '100200');
  });

  it('transform()은 기존 캠핑장 표준중분류/노출중분류를 재사용한다', () => {
    const adapter = new SmartSeoulCampingAdapter();
    const rows = adapter.transform([SAMPLE_ITEM]);
    expect(rows[0].category_min).toBe('캠핑장');
    expect(rows[0].service_category_id).toBe(SMART_SEOUL_CAMPING_SERVICE_CATEGORY_ID);
  });

  it('badgeKey는 CAMPING_SEOUL_OPERATED다', () => {
    const adapter = new SmartSeoulCampingAdapter();
    expect(adapter.badgeKey).toBe(SMART_SEOUL_CAMPING_BADGE_KEY);
  });
});
