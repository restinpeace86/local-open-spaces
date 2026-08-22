// Task 9-6-4: gg-splash-events-adapter.mjs 단위 테스트
// - OPR_PRD("N개월(M월~M월)") 파싱 → start/end_date, 시즌이 지났으면 다음 해로 롤오버
// - 실제 도로명/지번 주소(HYDR_ADDR)라 VWorld 지오코딩으로 EXACT 정밀도 확보
// - 경기도 범위를 벗어난 지오코딩 결과는 오매칭으로 간주해 건너뜀(gg-culture-events-adapter.mjs와 동일 정책)
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/vworld-geocoder.mjs', () => ({
  hasVworldApiKey: vi.fn(() => true),
  geocode: vi.fn(),
}));

const { GgSplashEventsAdapter, parseOprPrd, computeSeasonDateRange } = await import('./gg-splash-events-adapter.mjs');
const { geocode } = await import('./lib/vworld-geocoder.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function splashBody({ code = 'INFO-000', message = '정상 처리되었습니다.', rows = [], totalCount = rows.length } = {}) {
  return {
    TBWTRWTRPLYHYDRDTAM: [{ head: [{ list_total_count: totalCount }, { RESULT: { CODE: code, MESSAGE: message } }, { api_version: '1.0' }] }, { row: rows }],
  };
}

// 실측 표본(2026-08-23 라이브 호출, 경기도 수원시).
const SPLASH_ITEM = {
  SIGUN_NM: '수원시',
  HYDR_NM: '방죽공원 조합놀이대',
  HYDR_KIND: '조합놀이대',
  HYDR_ADDR: '경기도 수원시 영통구 망포동 43-28',
  OPR_INST: '지자체',
  OPR_PRD: '3개월(6월~8월)',
};

const GEOCODE_RESULT = { lng: 127.05, lat: 37.24 };

describe('parseOprPrd', () => {
  // Task 9-6-4 실측(2026-08-23, 811건 라이브 수집): 최초 "N개월(M월~M월)" 하나만 가정했다가
  // 실제로는 4개 형식이 섞여 있음을 실행 중 발견했다 — 아래 4개 모두 실제 원본 표본이다.
  it('"N개월(M월~M월)" 형식에서 시작/종료 월을 추출한다', () => {
    expect(parseOprPrd('3개월(6월~8월)')).toEqual({ startMonth: 6, startDay: null, endMonth: 8, endDay: null });
    expect(parseOprPrd('4개월(6월~9월)')).toEqual({ startMonth: 6, startDay: null, endMonth: 9, endDay: null });
  });

  it('"N개월(M~M월)" 형식(시작월에 "월"이 없음)도 추출한다', () => {
    expect(parseOprPrd('3개월(6~8월)')).toEqual({ startMonth: 6, startDay: null, endMonth: 8, endDay: null });
  });

  it('"N개월(M월D일~M월D일)"/"N일(M월D일~M월D일)" 형식은 일자까지 추출한다', () => {
    expect(parseOprPrd('2개월(6월22일~8월18일)')).toEqual({ startMonth: 6, startDay: 22, endMonth: 8, endDay: 18 });
    expect(parseOprPrd('45일(7월15일~8월31일)')).toEqual({ startMonth: 7, startDay: 15, endMonth: 8, endDay: 31 });
  });

  it('"YYYY.M.D~M.D." 형식은 연도를 무시하고 월/일만 추출한다', () => {
    expect(parseOprPrd('2025.5.24~10.10.')).toEqual({ startMonth: 5, startDay: 24, endMonth: 10, endDay: 10 });
  });

  it('형식을 해석할 수 없으면 null을 반환한다(추측하지 않음)', () => {
    expect(parseOprPrd('상시운영')).toBeNull();
    expect(parseOprPrd('')).toBeNull();
    expect(parseOprPrd(null)).toBeNull();
  });
});

describe('computeSeasonDateRange', () => {
  it('시즌이 아직 오지 않았거나 진행 중이면 올해 날짜로 계산한다', () => {
    const today = new Date(2026, 4, 1); // 2026-05-01, 6~8월 시즌 시작 전
    const result = computeSeasonDateRange({ startMonth: 6, endMonth: 8 }, today);
    expect(result).toEqual({ startDate: '2026-06-01', endDate: '2026-08-31' });
  });

  it('올해 시즌이 이미 끝났으면 내년 같은 기간으로 굴린다', () => {
    const today = new Date(2026, 11, 25); // 2026-12-25, 6~8월 시즌은 이미 끝남
    const result = computeSeasonDateRange({ startMonth: 6, endMonth: 8 }, today);
    expect(result).toEqual({ startDate: '2027-06-01', endDate: '2027-08-31' });
  });

  it('startDay/endDay가 있으면(일자까지 명시된 형식) 그 날짜를 그대로 쓴다', () => {
    const today = new Date(2026, 4, 1); // 2026-05-01
    const result = computeSeasonDateRange({ startMonth: 6, startDay: 22, endMonth: 8, endDay: 18 }, today);
    expect(result).toEqual({ startDate: '2026-06-22', endDate: '2026-08-18' });
  });
});

describe('GgSplashEventsAdapter', () => {
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
      expect(() => new GgSplashEventsAdapter()).toThrow('VWORLD_API_KEY');
    });

    it('GG_DATA_API_KEY가 없으면 에러를 던진다', () => {
      delete process.env.GG_DATA_API_KEY;
      expect(() => new GgSplashEventsAdapter()).toThrow('GG_DATA_API_KEY');
    });
  });

  describe('fetch (User-Agent 헤더 + 페이지네이션)', () => {
    it('모든 요청에 User-Agent 헤더를 포함한다', async () => {
      const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(splashBody({ rows: [SPLASH_ITEM], totalCount: 1 }))));
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GgSplashEventsAdapter();
      await adapter.fetch();

      for (const call of fetchMock.mock.calls) {
        expect(call[1]?.headers?.['User-Agent']).toBeTruthy();
      }
    });

    it('RESULT.CODE가 INFO-000이 아니면 에러를 던진다', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(splashBody({ code: 'ERROR-310', message: '해당하는 서비스를 찾을 수 없습니다.' })))));

      const adapter = new GgSplashEventsAdapter();
      await expect(adapter.fetch()).rejects.toThrow('GgSplashEvents 에러 응답');
    });
  });

  describe('transform', () => {
    it('정상 항목을 events 표준 스키마 행(EXACT)으로 변환한다', async () => {
      const adapter = new GgSplashEventsAdapter();
      const rows = await adapter.transform({ items: [SPLASH_ITEM] });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title: '방죽공원 조합놀이대',
        event_type: 'OUTDOOR_NATURE',
        location_precision: 'EXACT',
        is_free: true,
        is_kids_friendly: true,
        facility_type: '야외',
        venue_name: '방죽공원 조합놀이대',
        sigungu_name: '수원시',
      });
      expect(rows[0].external_id).toMatch(/^GG_SPLASH_EVENT_[0-9a-f]{16}$/);
      expect(geocode).toHaveBeenCalledWith('경기도 수원시 영통구 망포동 43-28');
    });

    it('OPR_PRD 형식을 해석할 수 없으면 건너뛴다', async () => {
      const adapter = new GgSplashEventsAdapter();
      const rows = await adapter.transform({ items: [{ ...SPLASH_ITEM, OPR_PRD: '상시운영' }] });
      expect(rows).toEqual([]);
      expect(geocode).not.toHaveBeenCalled();
    });

    it('지오코딩 결과가 경기도 범위를 벗어나면 건너뛴다', async () => {
      geocode.mockResolvedValueOnce({ lng: 129.5, lat: 35.8 });
      const adapter = new GgSplashEventsAdapter();
      const rows = await adapter.transform({ items: [SPLASH_ITEM] });
      expect(rows).toEqual([]);
    });

    it('지오코딩 결과가 없으면 건너뛴다', async () => {
      geocode.mockResolvedValueOnce(null);
      const adapter = new GgSplashEventsAdapter();
      const rows = await adapter.transform({ items: [SPLASH_ITEM] });
      expect(rows).toEqual([]);
    });

    it('시설명/주소 중 하나라도 없으면 건너뛴다', async () => {
      const adapter = new GgSplashEventsAdapter();
      const rows = await adapter.transform({ items: [{ ...SPLASH_ITEM, HYDR_ADDR: '' }] });
      expect(rows).toEqual([]);
    });

    it('동일한 이름+주소는 동일한 external_id를 생성한다(결정적 해시)', async () => {
      const adapter = new GgSplashEventsAdapter();
      const rows1 = await adapter.transform({ items: [SPLASH_ITEM] });
      const rows2 = await adapter.transform({ items: [SPLASH_ITEM] });
      expect(rows1[0].external_id).toBe(rows2[0].external_id);
    });
  });
});
