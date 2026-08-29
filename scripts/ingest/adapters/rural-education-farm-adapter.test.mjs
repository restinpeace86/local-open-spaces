// [농어촌체험휴양마을 + 농촌교육농장 통합 수집](2026-08-29): rural-education-farm-adapter.mjs
// 단위 테스트. ⚠️ 실제 농사로(api.nongsaro.go.kr) 인증키가 없어 이 테스트는 참고 샘플
// (reference/농촌교육농장/샘플소스/rest/php/fmlgEdcFarmmList.php)의 필드 접근 경로와
// 실제 더미 키 호출로 확인한 에러 응답 XML 형식을 근거로 목(mock) 응답을 구성했다 — 실제
// 키 확보 후 라이브 검증이 필요하다(implementation 문서 참고).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/vworld-geocoder.mjs', () => ({
  hasVworldApiKey: vi.fn(() => true),
  geocode: vi.fn(),
}));

const { RuralEducationFarmAdapter, RURAL_EDUCATION_FARM_CATEGORY_MIN } = await import(
  './rural-education-farm-adapter.mjs'
);
const { geocode } = await import('./lib/vworld-geocoder.mjs');

function textResponse(body) {
  return { ok: true, text: async () => body };
}

// 샘플 코드(fmlgEdcFarmmList.php)의 필드 접근 경로(body->items->item[]/numOfRows/
// totalCount/pageNo)를 그대로 반영한 XML.
function listXml({ items = [], totalCount = items.length } = {}) {
  const itemsXml = items
    .map(
      (i) => `<item>
        <cntntsNo>${i.cntntsNo}</cntntsNo>
        <cntntsSj>${i.cntntsSj}</cntntsSj>
        <adstrdName>${i.adstrdName ?? ''}</adstrdName>
        <locplc>${i.locplc}</locplc>
        <thema>${i.thema ?? ''}</thema>
        <telno>${i.telno ?? ''}</telno>
      </item>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<response><body><items>${itemsXml}<numOfRows>${items.length}</numOfRows><totalCount>${totalCount}</totalCount><pageNo>1</pageNo></items></body></response>`;
}

// 실측 확인(2026-08-29, 더미 키로 실제 호출): 에러 응답은 body 없이 header만 온다.
const AUTH_ERROR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response><header><resultCode>11</resultCode><resultMsg>인증키가 등록되지 않았습니다.</resultMsg><requestParameter /></header></response>`;

const BASE_ITEM = {
  cntntsNo: '12345',
  cntntsSj: '푸른들판농장',
  adstrdName: '경기도 여주시',
  locplc: '경기도 여주시 산북면 상활안길 10',
  thema: '농촌생활체험',
  telno: '031-000-0000',
};

const GEOCODE_RESULT = { lng: 127.6, lat: 37.3 };

describe('RuralEducationFarmAdapter', () => {
  beforeEach(() => {
    process.env.NONGSARO_API_KEY = 'test-nongsaro-key';
    vi.restoreAllMocks();
    geocode.mockReset();
    geocode.mockResolvedValue(GEOCODE_RESULT);
  });

  describe('constructor', () => {
    it('NONGSARO_API_KEY가 없으면 에러를 던진다', () => {
      delete process.env.NONGSARO_API_KEY;
      expect(() => new RuralEducationFarmAdapter()).toThrow('NONGSARO_API_KEY');
    });

    it('VWORLD_API_KEY가 없으면 에러를 던진다', async () => {
      const { hasVworldApiKey } = await import('./lib/vworld-geocoder.mjs');
      hasVworldApiKey.mockReturnValueOnce(false);
      expect(() => new RuralEducationFarmAdapter()).toThrow('VWORLD_API_KEY');
    });
  });

  describe('fetch (페이지네이션/XML 파싱)', () => {
    it('totalCount에 도달할 때까지 pageNo를 증가시키며 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        const pageNo = new URL(url).searchParams.get('pageNo');
        if (pageNo === '1')
          return Promise.resolve(textResponse(listXml({ items: [BASE_ITEM], totalCount: 2 })));
        if (pageNo === '2')
          return Promise.resolve(
            textResponse(listXml({ items: [{ ...BASE_ITEM, cntntsNo: '99999' }], totalCount: 2 }))
          );
        throw new Error(`unexpected pageNo ${pageNo}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new RuralEducationFarmAdapter();
      const items = await adapter.fetch();

      expect(items).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('빈 페이지를 만나면 안전하게 중단한다(totalCount 오기재 방어)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(textResponse(listXml({ items: [], totalCount: 999 }))))
      );

      const adapter = new RuralEducationFarmAdapter();
      const items = await adapter.fetch();

      expect(items).toEqual([]);
    });

    it('인증 실패 등 body 없는 에러 응답이면 에러를 던진다', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(textResponse(AUTH_ERROR_XML))));

      const adapter = new RuralEducationFarmAdapter();
      await expect(adapter.fetch()).rejects.toThrow('RuralEducationFarm 에러 응답');
    });

    it('XML이 아닌 응답이면 에러를 던진다', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(textResponse('not xml at all'))));

      const adapter = new RuralEducationFarmAdapter();
      await expect(adapter.fetch()).rejects.toThrow();
    });
  });

  describe('transform', () => {
    it('지오코딩으로 좌표를 보정해 표준 스키마 행을 생성하고 category_min을 매긴다', async () => {
      const adapter = new RuralEducationFarmAdapter();
      const rows = await adapter.transform([BASE_ITEM]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        external_id: 'RURAL_EDU_FARM_12345',
        source_type: 'RURAL_EDUCATION_FARM',
        name: '푸른들판농장',
        category: 'EXPERIENCE_CLASS',
        address: '경기도 여주시 산북면 상활안길 10',
        is_free: null,
        info_url: null,
        is_kids_friendly: true,
        category_min: RURAL_EDUCATION_FARM_CATEGORY_MIN,
        category_min_source: 'RAW',
      });
      expect(geocode).toHaveBeenCalledWith(BASE_ITEM.locplc);
      const match = rows[0].location.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const [, lng, lat] = match;
      expect(Number(lng)).toBeCloseTo(GEOCODE_RESULT.lng, 4);
      expect(Number(lat)).toBeCloseTo(GEOCODE_RESULT.lat, 4);
    });

    it('지오코딩이 실패하면 해당 항목을 건너뛴다', async () => {
      geocode.mockResolvedValueOnce(null);
      const adapter = new RuralEducationFarmAdapter();
      const rows = await adapter.transform([BASE_ITEM]);

      expect(rows).toEqual([]);
    });

    it('명칭/주소/콘텐츠번호 중 하나라도 없으면 해당 항목을 건너뛴다', async () => {
      const adapter = new RuralEducationFarmAdapter();
      const rows = await adapter.transform([
        { ...BASE_ITEM, cntntsSj: '' },
        { ...BASE_ITEM, locplc: '' },
        { ...BASE_ITEM, cntntsNo: '' },
      ]);

      expect(rows).toEqual([]);
    });

    it('동일한 cntntsNo는 동일한 external_id를 생성한다', async () => {
      const adapter = new RuralEducationFarmAdapter();
      const rows1 = await adapter.transform([BASE_ITEM]);
      const rows2 = await adapter.transform([BASE_ITEM]);
      expect(rows1[0].external_id).toBe(rows2[0].external_id);
    });
  });
});
