// Task 3: cultural-facility-summary-adapter.mjs 단위 테스트
// - pblshYr 연도 Fallback(차감) 로직
// - VWORLD_API_KEY 부재 시 명시적 경고 후 스킵 처리 (todo.md Task 1 요구사항)
// - 지오코딩 성공/실패에 따른 open_spaces 표준 스키마 행 변환
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/vworld-geocoder.mjs', () => ({
  hasVworldApiKey: vi.fn(),
  geocode: vi.fn(),
}));

const { hasVworldApiKey, geocode } = await import('./lib/vworld-geocoder.mjs');
const { CulturalFacilitySummaryAdapter } = await import('./cultural-facility-summary-adapter.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function apiBody({ resultCode = '00', data = [], totalCount = data.length } = {}) {
  return {
    response: {
      header: { resultCode, resultMsg: 'SUCCESS' },
      body: { data, pageNo: '1', numOfRows: '100', totalCount: String(totalCount) },
    },
  };
}

const MSM_ENDPOINT = { typeKey: 'MSM', path: 'clifMsmv1', nameField: 'msmNm', addressField: 'instAddr' };

describe('CulturalFacilitySummaryAdapter', () => {
  let adapter;

  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'test-public-data-key';
    adapter = new CulturalFacilitySummaryAdapter();
    vi.restoreAllMocks();
    hasVworldApiKey.mockReset();
    geocode.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('resolvePblshYr (연도 Fallback)', () => {
    it('최근 연도(2024)에 데이터가 없으면 2023년으로 차감 조회한다', async () => {
      const fetchMock = vi.fn((url) => {
        const yr = new URL(url).searchParams.get('pblshYr');
        if (yr === '2024') return Promise.resolve(jsonResponse(apiBody({ totalCount: 0 })));
        if (yr === '2023') return Promise.resolve(jsonResponse(apiBody({ totalCount: 918 })));
        throw new Error(`unexpected pblshYr ${yr}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const year = await adapter.resolvePblshYr('clifMsmv1');
      expect(year).toBe(2023);
    });

    it('후보 연도(2024~2022) 모두 데이터가 없으면 null을 반환한다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse(apiBody({ totalCount: 0 }))))
      );

      const year = await adapter.resolvePblshYr('clifMsmv1');
      expect(year).toBeNull();
    });
  });

  describe('transform', () => {
    it('VWORLD_API_KEY가 없으면 명시적으로 경고하고 빈 배열을 반환한다', async () => {
      hasVworldApiKey.mockReturnValue(false);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rows = await adapter.transform([
        { endpoint: MSM_ENDPOINT, item: { msmNm: '테스트박물관', instAddr: '서울시 종로구 1', instId: '000123' } },
      ]);

      expect(rows).toEqual([]);
      expect(geocode).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('VWORLD_API_KEY'));
    });

    it('지오코딩 성공 시 open_spaces 표준 스키마 행을 생성한다', async () => {
      hasVworldApiKey.mockReturnValue(true);
      geocode.mockResolvedValue({ lng: 127.123, lat: 37.456 });

      const rows = await adapter.transform([
        {
          endpoint: MSM_ENDPOINT,
          item: {
            msmNm: '테스트박물관',
            instAddr: '서울시 종로구 테스트로 1',
            instId: '000123',
            hmpgAddr: 'http://test.example',
          },
        },
      ]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        external_id: 'CULTURAL_FACILITY_SUMMARY_MSM_000123',
        source_type: 'CULTURAL_FACILITY_SUMMARY',
        name: '테스트박물관',
        category: 'EXHIBITION_MUSEUM',
        address: '서울시 종로구 테스트로 1',
        location: 'SRID=4326;POINT(127.123 37.456)',
        is_free: null,
        info_url: 'http://test.example',
      });
    });

    it('지오코딩 결과가 없으면 해당 항목을 건너뛴다', async () => {
      hasVworldApiKey.mockReturnValue(true);
      geocode.mockResolvedValue(null);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rows = await adapter.transform([
        { endpoint: MSM_ENDPOINT, item: { msmNm: '테스트박물관', instAddr: '알 수 없는 주소', instId: '000123' } },
      ]);

      expect(rows).toEqual([]);
    });

    it('name/address/instId 중 하나라도 없으면 건너뛴다', async () => {
      hasVworldApiKey.mockReturnValue(true);

      const rows = await adapter.transform([
        { endpoint: MSM_ENDPOINT, item: { msmNm: '테스트박물관', instAddr: null, instId: '000123' } },
      ]);

      expect(rows).toEqual([]);
      expect(geocode).not.toHaveBeenCalled();
    });
  });
});
