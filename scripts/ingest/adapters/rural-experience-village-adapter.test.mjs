// [농어촌체험휴양마을 + 농촌교육농장 통합 수집](2026-08-29): rural-experience-village-adapter.mjs
// 단위 테스트 — city-park-adapter.mjs(표준데이터 봉투/페이지네이션)와 gg-kidscafe-adapter.mjs
// (원본 좌표 우선 사용 + 결측 시 VWorld 지오코딩 폴백) 패턴을 그대로 재사용한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/vworld-geocoder.mjs', () => ({
  hasVworldApiKey: vi.fn(() => true),
  geocode: vi.fn(),
}));

const { RuralExperienceVillageAdapter, RURAL_EXPERIENCE_VILLAGE_CATEGORY_MIN } = await import(
  './rural-experience-village-adapter.mjs'
);
const { geocode } = await import('./lib/vworld-geocoder.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function apiBody({ resultCode = '00', items = [], totalCount = items.length } = {}) {
  return {
    header: { resultCode, resultMsg: 'NORMAL SERVICE.' },
    body: { items: { item: items }, numOfRows: items.length, pageNo: 1, totalCount },
  };
}

// 실측 표본(2026-08-29, 실제 서비스키로 직접 호출해 확인한 필드 그대로).
const BASE_ITEM = {
  exprnVilageNm: '버섯구지마을',
  ctprvnNm: '경기도',
  signguNm: '가평군',
  exprnSe: '건강+자연생태체험+만들기체험+기타(영농체험+먹거리체험+농촌생활체험)',
  exprnCn: '감자캐기체험+달고나체험+목공예체험',
  holdFclty: '',
  exprnAr: '',
  exprnPicUrl: '',
  rdnmadr: '경기도 가평군 하면 대보간선로 173',
  lnmadr: '',
  rprsntvNm: '조은실',
  phoneNumber: '031-584-9614',
  appnDate: '2011-03-01',
  homepageUrl: '',
  institutionNm: '경기도 가평군청',
  latitude: '37.809482',
  longitude: '127.364268',
  referenceDate: '2026-01-28',
  insttCode: 'B552149',
  insttNm: '한국농어촌공사',
};

const GEOCODE_RESULT = { lng: 127.5, lat: 37.6 };

describe('RuralExperienceVillageAdapter', () => {
  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'test-public-data-key';
    vi.restoreAllMocks();
    geocode.mockReset();
    geocode.mockResolvedValue(GEOCODE_RESULT);
  });

  describe('constructor', () => {
    it('PUBLIC_DATA_API_KEY가 없으면 에러를 던진다', () => {
      delete process.env.PUBLIC_DATA_API_KEY;
      expect(() => new RuralExperienceVillageAdapter()).toThrow('PUBLIC_DATA_API_KEY');
    });

    it('VWORLD_API_KEY가 없으면 에러를 던진다', async () => {
      const { hasVworldApiKey } = await import('./lib/vworld-geocoder.mjs');
      hasVworldApiKey.mockReturnValueOnce(false);
      expect(() => new RuralExperienceVillageAdapter()).toThrow('VWORLD_API_KEY');
    });
  });

  describe('fetch (페이지네이션)', () => {
    it('totalCount에 도달할 때까지 pageNo를 증가시키며 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        const pageNo = new URL(url).searchParams.get('pageNo');
        if (pageNo === '1') return Promise.resolve(jsonResponse(apiBody({ items: [BASE_ITEM], totalCount: 101 })));
        if (pageNo === '2')
          return Promise.resolve(
            jsonResponse(apiBody({ items: [{ ...BASE_ITEM, exprnVilageNm: '제2마을' }], totalCount: 101 }))
          );
        throw new Error(`unexpected pageNo ${pageNo}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new RuralExperienceVillageAdapter();
      const items = await adapter.fetch();

      expect(items).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('resultCode가 00이 아니면 에러를 던진다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse(apiBody({ resultCode: '10', items: [] }))))
      );

      const adapter = new RuralExperienceVillageAdapter();
      await expect(adapter.fetch()).rejects.toThrow('RuralExperienceVillage 에러 응답');
    });
  });

  describe('transform', () => {
    it('원본 좌표를 그대로 사용해 표준 스키마 행을 생성하고 category_min을 매긴다', async () => {
      const adapter = new RuralExperienceVillageAdapter();
      const rows = await adapter.transform([BASE_ITEM]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source_type: 'RURAL_EXPERIENCE_VILLAGE',
        name: '버섯구지마을',
        category: 'EXPERIENCE_CLASS',
        address: '경기도 가평군 하면 대보간선로 173',
        location: 'SRID=4326;POINT(127.364268 37.809482)',
        is_free: null,
        category_min: RURAL_EXPERIENCE_VILLAGE_CATEGORY_MIN,
        category_min_source: 'RAW',
      });
      expect(rows[0].external_id).toMatch(/^RURAL_VILLAGE_[0-9a-f]{16}$/);
      expect(geocode).not.toHaveBeenCalled();
    });

    it('homepageUrl이 있으면 info_url로 매핑한다', async () => {
      const adapter = new RuralExperienceVillageAdapter();
      const rows = await adapter.transform([{ ...BASE_ITEM, homepageUrl: 'http://버섯구지마을.kr' }]);

      expect(rows[0].info_url).toBe('http://버섯구지마을.kr');
    });

    it('homepageUrl이 없으면 info_url은 null이다', async () => {
      const adapter = new RuralExperienceVillageAdapter();
      const rows = await adapter.transform([{ ...BASE_ITEM, homepageUrl: '' }]);

      expect(rows[0].info_url).toBeNull();
    });

    it('rdnmadr이 없으면 lnmadr로 대체한다', async () => {
      const adapter = new RuralExperienceVillageAdapter();
      const rows = await adapter.transform([{ ...BASE_ITEM, rdnmadr: '', lnmadr: '경기도 가평군 하면 지번 1' }]);

      expect(rows[0].address).toBe('경기도 가평군 하면 지번 1');
    });

    it('좌표가 결측이면 VWorld 지오코딩으로 보정한다', async () => {
      const adapter = new RuralExperienceVillageAdapter();
      const itemWithoutCoords = { ...BASE_ITEM, latitude: '', longitude: '' };
      const rows = await adapter.transform([itemWithoutCoords]);

      expect(geocode).toHaveBeenCalledWith(BASE_ITEM.rdnmadr);
      const match = rows[0].location.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const [, lng, lat] = match;
      expect(Number(lng)).toBeCloseTo(GEOCODE_RESULT.lng, 4);
      expect(Number(lat)).toBeCloseTo(GEOCODE_RESULT.lat, 4);
    });

    it('지오코딩도 실패하면 해당 항목을 건너뛴다', async () => {
      geocode.mockResolvedValueOnce(null);
      const adapter = new RuralExperienceVillageAdapter();
      const rows = await adapter.transform([{ ...BASE_ITEM, latitude: '', longitude: '' }]);

      expect(rows).toEqual([]);
    });

    it('명칭/주소 중 하나라도 없으면 해당 항목을 건너뛴다', async () => {
      const adapter = new RuralExperienceVillageAdapter();
      const rows = await adapter.transform([
        { ...BASE_ITEM, exprnVilageNm: '' },
        { ...BASE_ITEM, rdnmadr: '', lnmadr: '' },
      ]);

      expect(rows).toEqual([]);
    });

    it('exprnSe/exprnCn 텍스트에 실제 근거가 있을 때만 뱃지를 판별한다', async () => {
      const adapter = new RuralExperienceVillageAdapter();
      const rows = await adapter.transform([
        { ...BASE_ITEM, exprnSe: '가족 체험', exprnCn: '주차장 완비, 유모차 대여 가능' },
      ]);

      expect(rows[0]).toMatchObject({
        is_kids_friendly: true,
        has_parking: true,
        stroller_accessible: true,
      });
    });

    it('동일한 이름+주소는 동일한 external_id를 생성한다(결정적 해시)', async () => {
      const adapter = new RuralExperienceVillageAdapter();
      const rows1 = await adapter.transform([BASE_ITEM]);
      const rows2 = await adapter.transform([BASE_ITEM]);
      expect(rows1[0].external_id).toBe(rows2[0].external_id);
    });
  });
});
