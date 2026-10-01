import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/smart-seoul-map-client.mjs', () => ({
  fetchAllSmartSeoulMapContents: vi.fn(),
}));

const { SmartSeoulKidsCafeVoucherAdapter, SMART_SEOUL_KIDS_CAFE_VOUCHER_BADGE_KEY } = await import(
  './smart-seoul-kids-cafe-voucher-adapter.mjs'
);
const { SMART_SEOUL_KIDS_CAFE_SERVICE_CATEGORY_ID } = await import('./smart-seoul-kids-cafe-adapter.mjs');
const { fetchAllSmartSeoulMapContents } = await import('../lib/smart-seoul-map-client.mjs');

const SAMPLE_ITEM = {
  COT_CONTS_ID: 'V1',
  COT_CONTS_NAME: '키즈카페 몽슈슈',
  COT_ADDR_FULL_NEW: '서울특별시 중구 동호로 201',
  COT_COORD_X: 127.0,
  COT_COORD_Y: 37.56,
};

describe('SmartSeoulKidsCafeVoucherAdapter', () => {
  beforeEach(() => {
    process.env.SMART_SEOUL_MAP_THEME_API_KEY = 'test-key';
    fetchAllSmartSeoulMapContents.mockReset();
  });

  afterEach(() => {
    delete process.env.SMART_SEOUL_MAP_THEME_API_KEY;
  });

  it('fetch()는 theme_id=1693879047939로 콘텐츠를 조회한다', async () => {
    fetchAllSmartSeoulMapContents.mockResolvedValue([SAMPLE_ITEM]);
    const adapter = new SmartSeoulKidsCafeVoucherAdapter();
    await adapter.fetch();
    expect(fetchAllSmartSeoulMapContents).toHaveBeenCalledWith('test-key', '1693879047939');
  });

  it('transform()은 키즈카페 어댑터와 동일한 노출중분류(키즈카페 / 실내놀이터)를 쓴다', () => {
    const adapter = new SmartSeoulKidsCafeVoucherAdapter();
    const rows = adapter.transform([SAMPLE_ITEM]);
    expect(rows[0].category_min).toBe('키즈카페');
    expect(rows[0].service_category_id).toBe(SMART_SEOUL_KIDS_CAFE_SERVICE_CATEGORY_ID);
  });

  it('badgeKey는 kc_voucher_accepted다', () => {
    const adapter = new SmartSeoulKidsCafeVoucherAdapter();
    expect(adapter.badgeKey).toBe(SMART_SEOUL_KIDS_CAFE_VOUCHER_BADGE_KEY);
  });
});
