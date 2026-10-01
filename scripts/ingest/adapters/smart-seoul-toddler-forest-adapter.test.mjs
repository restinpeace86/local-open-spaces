import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/smart-seoul-map-client.mjs', () => ({
  fetchAllSmartSeoulMapContents: vi.fn(),
}));

const { SmartSeoulToddlerForestAdapter, SMART_SEOUL_TODDLER_FOREST_SERVICE_CATEGORY_ID } = await import(
  './smart-seoul-toddler-forest-adapter.mjs'
);
const { fetchAllSmartSeoulMapContents } = await import('../lib/smart-seoul-map-client.mjs');

const SAMPLE_ITEM = {
  COT_CONTS_ID: 'F1',
  COT_CONTS_NAME: '종로구_1909-03',
  COT_ADDR_FULL_NEW: '서울특별시 종로구 경희궁3가길 31-5',
  COT_COORD_X: 126.97,
  COT_COORD_Y: 37.57,
};

describe('SmartSeoulToddlerForestAdapter', () => {
  beforeEach(() => {
    process.env.SMART_SEOUL_MAP_THEME_API_KEY = 'test-key';
    fetchAllSmartSeoulMapContents.mockReset();
  });

  afterEach(() => {
    delete process.env.SMART_SEOUL_MAP_THEME_API_KEY;
  });

  it('fetch()는 theme_id=100361로 콘텐츠를 조회한다', async () => {
    fetchAllSmartSeoulMapContents.mockResolvedValue([SAMPLE_ITEM]);
    const adapter = new SmartSeoulToddlerForestAdapter();
    await adapter.fetch();
    expect(fetchAllSmartSeoulMapContents).toHaveBeenCalledWith('test-key', '100361');
  });

  it('transform()은 신규 표준중분류(유아숲체험원)를 매긴다', () => {
    const adapter = new SmartSeoulToddlerForestAdapter();
    const rows = adapter.transform([SAMPLE_ITEM]);
    expect(rows[0].category_min).toBe('유아숲체험원');
    expect(rows[0].service_category_id).toBe(SMART_SEOUL_TODDLER_FOREST_SERVICE_CATEGORY_ID);
  });

  it('badgeKey는 null이다(사용자 확인: 독자적 신규 표준중분류라 뱃지 불필요)', () => {
    const adapter = new SmartSeoulToddlerForestAdapter();
    expect(adapter.badgeKey).toBeNull();
  });
});
