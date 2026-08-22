// Task 9-6-1: gg-culture-events-adapter.mjs 단위 테스트
// - GGCULTUREVENTSTUS(API1): 실측 확인 결과 주소/좌표 필드가 없어 전량 스킵(코드 결함이 아님)
// - GGCULFOUEVENSTM(API2): LOC_NM(콤마 구분 가능)을 VWorld로 지오코딩, extractSigunguName으로 지역 추출
// - User-Agent 헤더, INFO-000 성공 코드 처리, 페이지네이션, external_id 결정성
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/vworld-geocoder.mjs', () => ({
  hasVworldApiKey: vi.fn(() => true),
  geocode: vi.fn(),
}));

vi.mock('../lib/ai-tagging.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, classifyEventTypeWithAI: vi.fn(() => Promise.resolve('PERFORMANCE_FESTIVAL')) };
});

const { GgCultureEventsAdapter } = await import('./gg-culture-events-adapter.mjs');
const { geocode } = await import('./lib/vworld-geocoder.mjs');
const { classifyEventTypeWithAI } = await import('../lib/ai-tagging.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function cultureEventBody({ code = 'INFO-000', message = '정상 처리되었습니다.', rows = [], totalCount = rows.length } = {}) {
  return {
    GGCULTUREVENTSTUS: [{ head: [{ list_total_count: totalCount }, { RESULT: { CODE: code, MESSAGE: message } }, { api_version: '1.0' }] }, { row: rows }],
  };
}

function foundationEventBody({ code = 'INFO-000', message = '정상 처리되었습니다.', rows = [], totalCount = rows.length } = {}) {
  return {
    GGCULFOUEVENSTM: [{ head: [{ list_total_count: totalCount }, { RESULT: { CODE: code, MESSAGE: message } }, { api_version: '1.0' }] }, { row: rows }],
  };
}

// 실측 표본 그대로(2026-08-22 실제 호출 확인).
const CULTURE_EVENT_ITEM = {
  INST_NM: '경기문화재단',
  TITLE: '2026 업사이클 빌리지 페스티벌',
  CATEGORY_NM: '행사',
  URL: 'https://ggc.ggcf.kr/cultureEvents/view/6a7d2cef6e80097c99a4b31d',
  HOST_INST_NM: '경기도,경기환경에너지진흥원',
  IMAGE_URL: 'https://ggc.ggcf.kr/uploadimg/2023/file/20 업사이클플라자.jpg',
  BEGIN_DE: '20260911',
  END_DE: '20260912',
};

const FOUNDATION_EVENT_ITEM = {
  DIV_NM: '1274',
  TITLE_NM: '2025 기회소득 예술인 페스티벌 in 안산',
  BGNG_NM: '2025-11-15 00:00:00',
  END_NM: '2025-11-15 00:00:00',
  LOC_NM: '경기도 안산시 경기도미술관',
  CLASS_NM: '경기도 예술인,예술인 기회소득,예술인 축제,경기도미술관',
};

const GEOCODE_RESULT = { lng: 126.83, lat: 37.29 };

describe('GgCultureEventsAdapter', () => {
  beforeEach(() => {
    process.env.GG_DATA_API_KEY = 'test-gg-key';
    vi.restoreAllMocks();
    geocode.mockReset();
    geocode.mockResolvedValue(GEOCODE_RESULT);
    classifyEventTypeWithAI.mockClear();
    classifyEventTypeWithAI.mockResolvedValue('PERFORMANCE_FESTIVAL');
  });

  describe('constructor', () => {
    it('VWORLD_API_KEY가 없으면 에러를 던진다', async () => {
      const { hasVworldApiKey } = await import('./lib/vworld-geocoder.mjs');
      hasVworldApiKey.mockReturnValueOnce(false);
      expect(() => new GgCultureEventsAdapter()).toThrow('VWORLD_API_KEY');
    });

    it('GG_DATA_API_KEY가 없으면 에러를 던진다', () => {
      delete process.env.GG_DATA_API_KEY;
      expect(() => new GgCultureEventsAdapter()).toThrow('GG_DATA_API_KEY');
    });
  });

  describe('fetch (User-Agent 헤더 + 페이지네이션)', () => {
    it('모든 요청에 User-Agent 헤더를 포함한다', async () => {
      const fetchMock = vi.fn((url) => {
        if (url.includes('GGCULTUREVENTSTUS')) return Promise.resolve(jsonResponse(cultureEventBody({ rows: [CULTURE_EVENT_ITEM], totalCount: 1 })));
        return Promise.resolve(jsonResponse(foundationEventBody({ rows: [FOUNDATION_EVENT_ITEM], totalCount: 1 })));
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GgCultureEventsAdapter();
      await adapter.fetch();

      for (const call of fetchMock.mock.calls) {
        expect(call[1]?.headers?.['User-Agent']).toBeTruthy();
      }
    });

    it('list_total_count에 도달할 때까지 pIndex를 증가시키며 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        if (url.includes('GGCULTUREVENTSTUS')) {
          const pIndex = new URL(url).searchParams.get('pIndex');
          if (pIndex === '1') return Promise.resolve(jsonResponse(cultureEventBody({ rows: [CULTURE_EVENT_ITEM], totalCount: 1001 })));
          if (pIndex === '2') return Promise.resolve(jsonResponse(cultureEventBody({ rows: [{ ...CULTURE_EVENT_ITEM, TITLE: '2번째 행사' }], totalCount: 1001 })));
          throw new Error(`unexpected pIndex ${pIndex}`);
        }
        return Promise.resolve(jsonResponse(foundationEventBody({ rows: [], totalCount: 0 })));
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GgCultureEventsAdapter();
      const { cultureEventItems } = await adapter.fetch();

      expect(cultureEventItems).toHaveLength(2);
    });

    it('RESULT.CODE가 INFO-000이 아니면 에러를 던진다', async () => {
      vi.stubGlobal('fetch', vi.fn((url) => {
        if (url.includes('GGCULTUREVENTSTUS')) return Promise.resolve(jsonResponse(cultureEventBody({ code: 'ERROR-310', message: '해당하는 서비스를 찾을 수 없습니다.' })));
        return Promise.resolve(jsonResponse(foundationEventBody({ rows: [] })));
      }));

      const adapter = new GgCultureEventsAdapter();
      await expect(adapter.fetch()).rejects.toThrow('GgCultureEvents(GGCULTUREVENTSTUS) 에러 응답');
    });
  });

  describe('transform', () => {
    // 실측 확인(2026-08-22): API1(GGCULTUREVENTSTUS)에는 주소/좌표 필드가 전혀 없어 항상
    // 스킵된다 — 이는 어댑터 버그가 아니라 원본 API 자체의 한계다.
    it('API1(GGCULTUREVENTSTUS) 항목은 좌표를 만들 수 없어 전량 스킵한다', async () => {
      const adapter = new GgCultureEventsAdapter();
      const rows = await adapter.transform({ cultureEventItems: [CULTURE_EVENT_ITEM], foundationEventItems: [] });
      expect(rows).toEqual([]);
      expect(geocode).not.toHaveBeenCalled();
    });

    it('API2(GGCULFOUEVENSTM) 항목을 events 표준 스키마 행으로 변환한다', async () => {
      const adapter = new GgCultureEventsAdapter();
      const rows = await adapter.transform({ cultureEventItems: [], foundationEventItems: [FOUNDATION_EVENT_ITEM] });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title: '2025 기회소득 예술인 페스티벌 in 안산',
        start_date: '2025-11-15',
        end_date: '2025-11-15',
        venue_name: '경기도 안산시 경기도미술관',
        sigungu_name: '안산시',
        event_type: 'PERFORMANCE_FESTIVAL',
      });
      expect(rows[0].external_id).toMatch(/^GG_FOUNDATION_EVENT_[0-9a-f]{16}$/);
      expect(geocode).toHaveBeenCalledWith('경기도 안산시 경기도미술관');
    });

    it('LOC_NM이 콤마로 여러 장소를 나열하면 첫 번째 장소만 지오코딩한다', async () => {
      const adapter = new GgCultureEventsAdapter();
      await adapter.transform({
        cultureEventItems: [],
        foundationEventItems: [{ ...FOUNDATION_EVENT_ITEM, LOC_NM: '경기아트센터, 경기 예술인의 집, 수원SK아트리움' }],
      });
      expect(geocode).toHaveBeenCalledWith('경기아트센터');
    });

    it('지오코딩 결과가 없으면(장소명뿐이라 주소로 인식 못하는 경우 등) 해당 항목을 건너뛴다', async () => {
      geocode.mockResolvedValueOnce(null);
      const adapter = new GgCultureEventsAdapter();
      const rows = await adapter.transform({ cultureEventItems: [], foundationEventItems: [FOUNDATION_EVENT_ITEM] });
      expect(rows).toEqual([]);
    });

    // 실측 dry-run에서 발견한 버그 재현: "삼남길 제6길 화성효행길, ..."류 도보 코스 나열 LOC_NM을
    // VWorld가 울산/경주 인근(129.2°E, 35.9°N)의 무관한 동명 도로로 잘못 매칭해 "성공"을 반환했다.
    // 이 소스는 경기도 전용이므로 경기도 범위를 벗어난 좌표는 오매칭으로 보고 건너뛰어야 한다.
    it('지오코딩 결과가 경기도 범위를 크게 벗어나면(오매칭 의심) 해당 항목을 건너뛴다', async () => {
      geocode.mockResolvedValueOnce({ lng: 129.23, lat: 35.87 }); // 울산/경주 인근 — 경기도 아님
      const adapter = new GgCultureEventsAdapter();
      const rows = await adapter.transform({
        cultureEventItems: [],
        foundationEventItems: [{ ...FOUNDATION_EVENT_ITEM, LOC_NM: '삼남길 제6길 화성효행길, 평해길 제7길 지평향교길' }],
      });
      expect(rows).toEqual([]);
    });

    it('제목/시작일/종료일 중 하나라도 없으면 해당 항목을 건너뛴다', async () => {
      const adapter = new GgCultureEventsAdapter();
      const rows = await adapter.transform({
        cultureEventItems: [],
        foundationEventItems: [{ ...FOUNDATION_EVENT_ITEM, TITLE_NM: '' }],
      });
      expect(rows).toEqual([]);
    });

    it('동일한 DIV_NM은 동일한 external_id를 생성한다(결정적)', async () => {
      const adapter = new GgCultureEventsAdapter();
      const rows1 = await adapter.transform({ cultureEventItems: [], foundationEventItems: [FOUNDATION_EVENT_ITEM] });
      const rows2 = await adapter.transform({ cultureEventItems: [], foundationEventItems: [FOUNDATION_EVENT_ITEM] });
      expect(rows1[0].external_id).toBe(rows2[0].external_id);
    });

    it('CLASS_NM을 원본 라벨로 AI 분류기에 넘긴다', async () => {
      const adapter = new GgCultureEventsAdapter();
      await adapter.transform({ cultureEventItems: [], foundationEventItems: [FOUNDATION_EVENT_ITEM] });
      expect(classifyEventTypeWithAI).toHaveBeenCalledWith(
        expect.objectContaining({ rawLabel: FOUNDATION_EVENT_ITEM.CLASS_NM })
      );
    });
  });
});
