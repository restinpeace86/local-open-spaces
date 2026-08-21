// Task 8-2: gg-events-adapter.mjs 단위 테스트
// - User-Agent 헤더 포함 여부, INFO-000 성공 코드 처리, 페이지네이션
// - 좌표 필드가 없어 VWorld 지오코딩 필수(geocode 모킹으로 검증)
// - API1(PublicSwimmingPool): INOUTDR_DIV_NM 기준 facility_type 매핑, 소스 레벨 공공 확정으로 is_free=true 고정,
//   명칭 키워드 기반 is_kids_friendly
// - API2(TBWTRWTRPLYHYDRDTAM): is_free/is_kids_friendly 고정 true, facility_type 고정 '야외'
// - SHA1(이름|주소) 기반 external_id
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/vworld-geocoder.mjs', () => ({
  hasVworldApiKey: vi.fn(() => true),
  geocode: vi.fn(),
}));

const { GgEventsAdapter } = await import('./gg-events-adapter.mjs');
const { geocode } = await import('./lib/vworld-geocoder.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function poolBody({ code = 'INFO-000', message = '정상 처리되었습니다.', rows = [], totalCount = rows.length } = {}) {
  return {
    PublicSwimmingPool: [{ head: [{ list_total_count: totalCount }, { RESULT: { CODE: code, MESSAGE: message } }, { api_version: '1.0' }] }, { row: rows }],
  };
}

function splashBody({ code = 'INFO-000', message = '정상 처리되었습니다.', rows = [], totalCount = rows.length } = {}) {
  return {
    TBWTRWTRPLYHYDRDTAM: [{ head: [{ list_total_count: totalCount }, { RESULT: { CODE: code, MESSAGE: message } }, { api_version: '1.0' }] }, { row: rows }],
  };
}

// 실측 표본(경기도 남양주시): REFINE_ROADNM_ADDR 등 실제 응답 필드 그대로 사용.
const POOL_ITEM = {
  FACLT_NM: '남양주체육문화센터수영장',
  SIGUN_NM: '남양주시',
  REFINE_LOTNO_ADDR: '경기도 남양주시 이패동 산87번지',
  REFINE_ROADNM_ADDR: '경기도 남양주시 다산지금로 91',
  INOUTDR_DIV_NM: '실내',
};

// 실측 표본(경기도 수원시): HYDR_ADDR 등 실제 응답 필드 그대로 사용.
const SPLASH_ITEM = {
  HYDR_NM: '고래의모험 어린이공원',
  HYDR_KIND: '바닥분수, 조합놀이대',
  HYDR_ADDR: '경기도 수원시 권선구 세류동 1066-9',
  SIGUN_NM: '수원시',
};

const GEOCODE_RESULT = { lng: 127.123, lat: 37.456 };

describe('GgEventsAdapter', () => {
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
      expect(() => new GgEventsAdapter()).toThrow('VWORLD_API_KEY');
    });
  });

  describe('fetch (User-Agent 헤더 + 페이지네이션)', () => {
    it('모든 요청에 User-Agent 헤더를 포함한다', async () => {
      const fetchMock = vi.fn((url, options) => {
        if (url.includes('PublicSwimmingPool')) return Promise.resolve(jsonResponse(poolBody({ rows: [POOL_ITEM], totalCount: 1 })));
        return Promise.resolve(jsonResponse(splashBody({ rows: [SPLASH_ITEM], totalCount: 1 })));
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GgEventsAdapter();
      await adapter.fetch();

      for (const call of fetchMock.mock.calls) {
        expect(call[1]?.headers?.['User-Agent']).toBeTruthy();
      }
    });

    it('list_total_count에 도달할 때까지 pIndex를 증가시키며 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        if (url.includes('PublicSwimmingPool')) {
          const pIndex = new URL(url).searchParams.get('pIndex');
          if (pIndex === '1') return Promise.resolve(jsonResponse(poolBody({ rows: [POOL_ITEM], totalCount: 101 })));
          if (pIndex === '2') return Promise.resolve(jsonResponse(poolBody({ rows: [{ ...POOL_ITEM, FACLT_NM: '제2수영장' }], totalCount: 101 })));
          throw new Error(`unexpected pool pIndex ${pIndex}`);
        }
        return Promise.resolve(jsonResponse(splashBody({ rows: [], totalCount: 0 })));
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GgEventsAdapter();
      const { poolItems } = await adapter.fetch();

      expect(poolItems).toHaveLength(2);
    });

    it('RESULT.CODE가 INFO-000이 아니면 에러를 던진다', async () => {
      vi.stubGlobal('fetch', vi.fn((url) => {
        if (url.includes('PublicSwimmingPool')) return Promise.resolve(jsonResponse(poolBody({ code: 'ERROR-310', message: '해당하는 서비스를 찾을 수 없습니다.' })));
        return Promise.resolve(jsonResponse(splashBody({ rows: [] })));
      }));

      const adapter = new GgEventsAdapter();
      await expect(adapter.fetch()).rejects.toThrow('GgEvents(PublicSwimmingPool) 에러 응답');
    });
  });

  describe('transform', () => {
    it('API1/API2 정상 항목을 open_spaces 표준 스키마 행으로 변환한다', async () => {
      const adapter = new GgEventsAdapter();
      const rows = await adapter.transform({ poolItems: [POOL_ITEM], splashItems: [SPLASH_ITEM] });

      expect(rows).toHaveLength(2);

      const poolRow = rows.find((r) => r.name === POOL_ITEM.FACLT_NM);
      expect(poolRow).toMatchObject({
        source_type: 'GG_EVENTS',
        name: '남양주체육문화센터수영장',
        category: 'KIDS_ACTIVITY',
        address: '경기도 남양주시 다산지금로 91',
        facility_type: '실내',
        is_free: true,
        is_kids_friendly: false,
      });
      expect(poolRow.external_id).toMatch(/^GG_EVENTS_[0-9a-f]{16}$/);

      const splashRow = rows.find((r) => r.name === SPLASH_ITEM.HYDR_NM);
      expect(splashRow).toMatchObject({
        source_type: 'GG_EVENTS',
        name: '고래의모험 어린이공원',
        category: 'OUTDOOR_NATURE',
        address: '경기도 수원시 권선구 세류동 1066-9',
        facility_type: '야외',
        is_free: true,
        is_kids_friendly: true,
      });
    });

    it('지오코딩 결과가 없으면 해당 항목을 건너뛴다', async () => {
      geocode.mockResolvedValueOnce(null);
      const adapter = new GgEventsAdapter();
      const rows = await adapter.transform({ poolItems: [POOL_ITEM], splashItems: [] });
      expect(rows).toEqual([]);
    });

    it('지오코딩 호출이 실패해도 전체를 중단하지 않고 해당 항목만 건너뛴다', async () => {
      geocode.mockRejectedValueOnce(new Error('네트워크 오류'));
      const adapter = new GgEventsAdapter();
      const rows = await adapter.transform({ poolItems: [POOL_ITEM], splashItems: [SPLASH_ITEM] });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe(SPLASH_ITEM.HYDR_NM);
    });

    it('INOUTDR_DIV_NM이 실외이면 API1 facility_type을 야외로 매핑한다', async () => {
      const adapter = new GgEventsAdapter();
      const rows = await adapter.transform({
        poolItems: [{ ...POOL_ITEM, INOUTDR_DIV_NM: '실외' }],
        splashItems: [],
      });
      expect(rows[0].facility_type).toBe('야외');
    });

    it('명칭에 키즈 키워드가 포함되면 API1 is_kids_friendly를 true로 매핑한다', async () => {
      const adapter = new GgEventsAdapter();
      const rows = await adapter.transform({
        poolItems: [{ ...POOL_ITEM, FACLT_NM: '어린이 수영장' }],
        splashItems: [],
      });
      expect(rows[0].is_kids_friendly).toBe(true);
    });

    it('시설명/주소 중 하나라도 없으면 해당 항목을 건너뛴다', async () => {
      const adapter = new GgEventsAdapter();
      const rows = await adapter.transform({
        poolItems: [{ ...POOL_ITEM, FACLT_NM: '' }],
        splashItems: [{ ...SPLASH_ITEM, HYDR_ADDR: '' }],
      });
      expect(rows).toEqual([]);
    });

    it('동일한 이름+주소는 동일한 external_id를 생성한다(결정적 해시)', async () => {
      const adapter = new GgEventsAdapter();
      const rows1 = await adapter.transform({ poolItems: [POOL_ITEM], splashItems: [] });
      const rows2 = await adapter.transform({ poolItems: [POOL_ITEM], splashItems: [] });
      expect(rows1[0].external_id).toBe(rows2[0].external_id);
    });
  });
});
