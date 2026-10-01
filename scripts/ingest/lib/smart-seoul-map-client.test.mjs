import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSmartSeoulMapContentsUrl, fetchAllSmartSeoulMapContents, SMART_SEOUL_MAP_DEFAULT_DISTANCE_M } from './smart-seoul-map-client.mjs';

describe('buildSmartSeoulMapContentsUrl', () => {
  it('서울시청 좌표 + 기본 반경(300km) + 테마 ID로 URL을 만든다', () => {
    const url = buildSmartSeoulMapContentsUrl('TEST_KEY', { themeId: '100200' });
    expect(url).toContain('/openapi/v5/TEST_KEY/public/themes/contents/ko');
    expect(url).toContain('coord_x=126.978');
    expect(url).toContain('coord_y=37.5665');
    expect(url).toContain(`distance=${SMART_SEOUL_MAP_DEFAULT_DISTANCE_M}`);
    expect(url).toContain('theme_id=100200');
    expect(url).toContain('page_no=1');
  });

  it('distance/pageNo를 명시하면 그 값을 쓴다', () => {
    const url = buildSmartSeoulMapContentsUrl('TEST_KEY', { themeId: '1', pageNo: 3, distance: 50000 });
    expect(url).toContain('page_no=3');
    expect(url).toContain('distance=50000');
  });
});

describe('fetchAllSmartSeoulMapContents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1페이지(PAGE_COUNT=1)면 한 번만 호출하고 body를 그대로 반환한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        header: { resultCode: '200', TOTAL_COUNT: '2', PAGE_COUNT: '1' },
        body: [{ COT_CONTS_ID: 'a' }, { COT_CONTS_ID: 'b' }],
      }),
    });

    const items = await fetchAllSmartSeoulMapContents('KEY', '100200');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(items).toEqual([{ COT_CONTS_ID: 'a' }, { COT_CONTS_ID: 'b' }]);
  });

  it('PAGE_COUNT가 2 이상이면 끝까지 순차 호출해서 합친다', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        json: async () => ({
          header: { resultCode: '200', TOTAL_COUNT: '4', PAGE_COUNT: '2' },
          body: [{ COT_CONTS_ID: `page${call}` }],
        }),
      };
    });

    const items = await fetchAllSmartSeoulMapContents('KEY', '100200');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(items).toEqual([{ COT_CONTS_ID: 'page1' }, { COT_CONTS_ID: 'page2' }]);
  });

  it('HTTP 오류면 에러를 던진다', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchAllSmartSeoulMapContents('KEY', '100200')).rejects.toThrow('HTTP 500');
  });

  it('resultCode가 200이 아니면 에러를 던진다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ header: { resultCode: '121' }, body: [] }),
    });
    await expect(fetchAllSmartSeoulMapContents('KEY', '100200')).rejects.toThrow('에러 응답');
  });
});
