// [경기 키즈카페/놀이시설 휴게음식점 수집](2026-08-29): gg-kidscafe-adapter.mjs 단위 테스트
// - User-Agent 헤더 포함 여부, INFO-000 성공 코드 처리, 페이지네이션(gg-events-adapter.mjs와
//   동일 응답 봉투)
// - 원본 REFINE_WGS84_LOGT/LAT 좌표를 그대로 사용, 결측 시에만 VWorld 지오코딩 폴백
// - BSN_STATE_NM('영업'만 유효, '폐업' 제외)
// - Kidscafe -> category_min='키즈카페', Resrestrtkidscafe -> category_min='놀이방식당'
// - SHA1(이름|주소) 기반 external_id
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/vworld-geocoder.mjs', () => ({
  hasVworldApiKey: vi.fn(() => true),
  geocode: vi.fn(),
}));

const { GgKidscafeAdapter, KIDS_CAFE_CATEGORY_MIN, PLAY_RESTAURANT_CATEGORY_MIN } = await import('./gg-kidscafe-adapter.mjs');
const { geocode } = await import('./lib/vworld-geocoder.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function kidscafeBody({ code = 'INFO-000', message = '정상 처리되었습니다.', rows = [], totalCount = rows.length } = {}) {
  return {
    Kidscafe: [{ head: [{ list_total_count: totalCount }, { RESULT: { CODE: code, MESSAGE: message } }, { api_version: '1.0' }] }, { row: rows }],
  };
}

function resrestrtBody({ code = 'INFO-000', message = '정상 처리되었습니다.', rows = [], totalCount = rows.length } = {}) {
  return {
    Resrestrtkidscafe: [{ head: [{ list_total_count: totalCount }, { RESULT: { CODE: code, MESSAGE: message } }, { api_version: '1.0' }] }, { row: rows }],
  };
}

// 실측 표본(경기도 의정부시): 응답 필드 그대로 사용.
const KIDSCAFE_ITEM = {
  SIGUN_NM: '여주시',
  BIZPLC_NM: '성진푸드(주) O cafe',
  BSN_STATE_NM: '영업',
  SANITTN_BIZCOND_NM: '키즈카페',
  REFINE_LOTNO_ADDR: '경기도 여주시 연양동 414',
  REFINE_ROADNM_ADDR: '경기도 여주시 강변유원지길 45 (연양동)',
  REFINE_WGS84_LOGT: '127.6610453000',
  REFINE_WGS84_LAT: '37.2931013000',
};

// 실측 표본(경기도 하남시): 응답 필드 그대로 사용 — Resrestrtkidscafe는 SANITTN_BIZCOND_NM이
// '한식'/'커피숍' 등 다양한 일반 음식점 업종으로도 나타남을 실측 확인했다(어댑터는 업종과
// 무관하게 소스 전체를 '놀이방식당'으로 매핑한다).
const RESRESTRT_ITEM = {
  SIGUN_NM: '하남시',
  BIZPLC_NM: '디아망 하남미사점',
  BSN_STATE_NM: '영업',
  SANITTN_BIZCOND_NM: '한식',
  REFINE_LOTNO_ADDR: '경기도 하남시 망월동 1093 경서타워 ',
  REFINE_ROADNM_ADDR: '경기도 하남시 미사강변동로 127, 경서타워 1201~1206호 12층 (망월동)',
  REFINE_WGS84_LOGT: '127.1910504000',
  REFINE_WGS84_LAT: '37.5661673000',
};

const GEOCODE_RESULT = { lng: 127.123, lat: 37.456 };

describe('GgKidscafeAdapter', () => {
  beforeEach(() => {
    process.env.GG_DATA_API_KEY = 'test-gg-key';
    vi.restoreAllMocks();
    geocode.mockReset();
    geocode.mockResolvedValue(GEOCODE_RESULT);
  });

  describe('constructor', () => {
    it('VWORLD_API_KEY가 없으면 에러를 던진다', async () => {
      const { hasVworldApiKey } = await import('./lib/vworld-geocoder.mjs');
      hasVworldApiKey.mockReturnValueOnce(false);
      expect(() => new GgKidscafeAdapter()).toThrow('VWORLD_API_KEY');
    });

    it('GG_DATA_API_KEY가 없으면 에러를 던진다', () => {
      delete process.env.GG_DATA_API_KEY;
      expect(() => new GgKidscafeAdapter()).toThrow('GG_DATA_API_KEY');
    });
  });

  describe('fetch (User-Agent 헤더 + 페이지네이션)', () => {
    it('모든 요청에 User-Agent 헤더를 포함한다', async () => {
      const fetchMock = vi.fn((url) => {
        if (url.includes('/Kidscafe')) return Promise.resolve(jsonResponse(kidscafeBody({ rows: [KIDSCAFE_ITEM], totalCount: 1 })));
        return Promise.resolve(jsonResponse(resrestrtBody({ rows: [RESRESTRT_ITEM], totalCount: 1 })));
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GgKidscafeAdapter();
      await adapter.fetch();

      for (const call of fetchMock.mock.calls) {
        expect(call[1]?.headers?.['User-Agent']).toBeTruthy();
      }
    });

    it('list_total_count에 도달할 때까지 pIndex를 증가시키며 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        if (url.includes('/Kidscafe')) {
          const pIndex = new URL(url).searchParams.get('pIndex');
          if (pIndex === '1') return Promise.resolve(jsonResponse(kidscafeBody({ rows: [KIDSCAFE_ITEM], totalCount: 101 })));
          if (pIndex === '2') return Promise.resolve(jsonResponse(kidscafeBody({ rows: [{ ...KIDSCAFE_ITEM, BIZPLC_NM: '제2키즈카페' }], totalCount: 101 })));
          throw new Error(`unexpected kidscafe pIndex ${pIndex}`);
        }
        return Promise.resolve(jsonResponse(resrestrtBody({ rows: [], totalCount: 0 })));
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GgKidscafeAdapter();
      const { kidscafeItems } = await adapter.fetch();

      expect(kidscafeItems).toHaveLength(2);
    });

    it('RESULT.CODE가 INFO-000이 아니면 에러를 던진다', async () => {
      vi.stubGlobal('fetch', vi.fn((url) => {
        if (url.includes('/Kidscafe')) return Promise.resolve(jsonResponse(kidscafeBody({ code: 'ERROR-310', message: '해당하는 서비스를 찾을 수 없습니다.' })));
        return Promise.resolve(jsonResponse(resrestrtBody({ rows: [] })));
      }));

      const adapter = new GgKidscafeAdapter();
      await expect(adapter.fetch()).rejects.toThrow('GgKidscafe(Kidscafe) 에러 응답');
    });
  });

  describe('transform', () => {
    it('Kidscafe/Resrestrtkidscafe 정상 항목을 open_spaces 표준 스키마 행으로 변환하고 각각 다른 category_min을 매긴다', async () => {
      const adapter = new GgKidscafeAdapter();
      const rows = await adapter.transform({ kidscafeItems: [KIDSCAFE_ITEM], resrestrtItems: [RESRESTRT_ITEM] });

      expect(rows).toHaveLength(2);

      const kidscafeRow = rows.find((r) => r.name === KIDSCAFE_ITEM.BIZPLC_NM);
      expect(kidscafeRow).toMatchObject({
        source_type: 'GG_KIDSCAFE',
        name: '성진푸드(주) O cafe',
        category: 'KIDS_ACTIVITY',
        address: '경기도 여주시 강변유원지길 45 (연양동)',
        facility_type: '실내',
        is_free: null,
        is_kids_friendly: true,
        category_min: KIDS_CAFE_CATEGORY_MIN,
        category_min_source: 'RAW',
      });
      expect(kidscafeRow.external_id).toMatch(/^GG_KIDSCAFE_[0-9a-f]{16}$/);

      const restaurantRow = rows.find((r) => r.name === RESRESTRT_ITEM.BIZPLC_NM);
      expect(restaurantRow).toMatchObject({
        source_type: 'GG_KIDSCAFE',
        name: '디아망 하남미사점',
        category_min: PLAY_RESTAURANT_CATEGORY_MIN,
        category_min_source: 'RAW',
      });
    });

    it('원본 REFINE_WGS84 좌표를 그대로 사용하고 geocode는 호출하지 않는다', async () => {
      const adapter = new GgKidscafeAdapter();
      const rows = await adapter.transform({ kidscafeItems: [KIDSCAFE_ITEM], resrestrtItems: [] });

      expect(rows[0]).toBeTruthy();
      const match = rows[0].location.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const [, lng, lat] = match;
      expect(Number(lng)).toBeCloseTo(127.6610453, 4);
      expect(Number(lat)).toBeCloseTo(37.2931013, 4);
      expect(geocode).not.toHaveBeenCalled();
    });

    it('좌표가 결측이면 VWorld 지오코딩으로 보정한다', async () => {
      const adapter = new GgKidscafeAdapter();
      const itemWithoutCoords = { ...KIDSCAFE_ITEM, REFINE_WGS84_LOGT: null, REFINE_WGS84_LAT: null };
      const rows = await adapter.transform({ kidscafeItems: [itemWithoutCoords], resrestrtItems: [] });

      expect(geocode).toHaveBeenCalledWith(KIDSCAFE_ITEM.REFINE_ROADNM_ADDR);
      const match = rows[0].location.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const [, lng, lat] = match;
      expect(Number(lng)).toBeCloseTo(GEOCODE_RESULT.lng, 4);
      expect(Number(lat)).toBeCloseTo(GEOCODE_RESULT.lat, 4);
    });

    it('지오코딩 결과가 경기도 범위를 벗어나면 오매칭으로 보고 건너뛴다(좌표 결측 건 한정)', async () => {
      geocode.mockResolvedValueOnce({ lng: 129.5, lat: 35.8 });
      const adapter = new GgKidscafeAdapter();
      const itemWithoutCoords = { ...KIDSCAFE_ITEM, REFINE_WGS84_LOGT: null, REFINE_WGS84_LAT: null };
      const rows = await adapter.transform({ kidscafeItems: [itemWithoutCoords], resrestrtItems: [] });
      expect(rows).toEqual([]);
    });

    it('BSN_STATE_NM이 폐업이면 제외한다', async () => {
      const adapter = new GgKidscafeAdapter();
      const rows = await adapter.transform({
        kidscafeItems: [{ ...KIDSCAFE_ITEM, BSN_STATE_NM: '폐업' }],
        resrestrtItems: [],
      });
      expect(rows).toEqual([]);
    });

    it('시설명/주소 중 하나라도 없으면 해당 항목을 건너뛴다', async () => {
      const adapter = new GgKidscafeAdapter();
      const rows = await adapter.transform({
        kidscafeItems: [{ ...KIDSCAFE_ITEM, BIZPLC_NM: '' }],
        resrestrtItems: [{ ...RESRESTRT_ITEM, REFINE_ROADNM_ADDR: '', REFINE_LOTNO_ADDR: '' }],
      });
      expect(rows).toEqual([]);
    });

    it('동일한 이름+주소는 동일한 external_id를 생성한다(결정적 해시)', async () => {
      const adapter = new GgKidscafeAdapter();
      const rows1 = await adapter.transform({ kidscafeItems: [KIDSCAFE_ITEM], resrestrtItems: [] });
      const rows2 = await adapter.transform({ kidscafeItems: [KIDSCAFE_ITEM], resrestrtItems: [] });
      expect(rows1[0].external_id).toBe(rows2[0].external_id);
    });
  });
});
