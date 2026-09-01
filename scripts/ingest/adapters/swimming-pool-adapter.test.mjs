// Task 7-3: swimming-pool-adapter.mjs 단위 테스트
// - API1(B551014, resultCode '00')/API2(1741000, resultCode '0') 서로 다른 성공 코드 처리
// - faci_stat_nm('정상운영')/SALS_STTS_NM('영업/정상') 기준 폐업 시설 필터링
// - EPSG:5174(API2) → WGS84 좌표 변환, API1은 이미 WGS84라 변환 없이 그대로 사용
// - inout_gbn_nm 기준 facility_type 매핑(API1), faci_gb_nm/PBP_SE_NM 기준 is_free 판별
// - 시설명+주소 정규화 기준 중복 식별(API1 우선)
// - 시설명/사업장명 키워드(어린이/유아/키즈/영유아/유아풀/어린이풀/키즈풀) 기준 is_kids_friendly 매핑 (2026-08-21 정밀화)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { SwimmingPoolAdapter, buildDedupKey, normalizeForDedup, matchesKidsKeyword } = await import(
  './swimming-pool-adapter.mjs'
);

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function api1Body({ resultCode = '00', items = [], totalCount = items.length } = {}) {
  return {
    response: {
      header: { resultCode, resultMsg: 'NORMAL SERVICE' },
      body: { pageNo: 1, totalCount, items: { item: items } },
    },
  };
}

function api2Body({ resultCode = '0', items = [], totalCount = items.length } = {}) {
  return {
    response: {
      header: { resultCode, resultMsg: '정상' },
      body: { dataType: 'JSON', pageNo: 1, totalCount, items: { item: items } },
    },
  };
}

// 실측 표본(경기도 이천시 호법면): faci_lat/faci_lot이 이미 WGS84 십진 위경도임을 확인한 값 그대로 사용.
const API1_ITEM = {
  faci_cd: 'C26D809A652359B7EF075D5EBFAEB928',
  faci_nm: '이천스포츠센터실내 수영장',
  faci_road_addr: '경기도 이천시 호법면 중부대로798번길 125',
  faci_addr: '경기도 이천시 호법면 안평리 787',
  faci_lat: '37.2363420612641',
  faci_lot: '127.411501932256',
  faci_stat_nm: '정상운영',
  inout_gbn_nm: '실내',
  faci_gb_nm: '공공',
};

// 실측 표본(경기도 용인시 처인구 이동읍): CRD_INFO_X/Y(EPSG:5174) → 변환 결과 lng=127.205/lat=37.191
// 로 실제 위치와 일치함을 확인한 값 그대로 사용.
const API2_ITEM = {
  MNG_NO: 'CDFH3301012026000004',
  BPLC_NM: '용천초어울림센터',
  ROAD_NM_ADDR: '경기도 용인시 처인구 이동읍 백옥대로 612, 용천초어울림센터',
  LOTNO_ADDR: '경기도 용인시 처인구 이동읍 천리 242-2 용천초어울림센터',
  CRD_INFO_X: '218409.379219368',
  CRD_INFO_Y: '409998.130061439',
  SALS_STTS_NM: '영업/정상',
  PBP_SE_NM: '사립',
};

describe('SwimmingPoolAdapter', () => {
  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'test-public-data-key';
    vi.restoreAllMocks();
  });

  describe('normalizeForDedup / buildDedupKey', () => {
    it('공백을 제거해 정규화한다', () => {
      expect(normalizeForDedup('이천 스포츠센터  수영장')).toBe('이천스포츠센터수영장');
    });

    it('이름+주소 조합으로 중복 식별 키를 만든다', () => {
      expect(buildDedupKey('가 나', '다 라')).toBe('가나|다라');
    });
  });

  describe('fetch (두 API 병렬 페이지네이션)', () => {
    it('API1/API2를 각각 totalCount에 도달할 때까지 조회해 병합 결과를 반환한다', async () => {
      const fetchMock = vi.fn((url) => {
        const u = new URL(url);
        if (u.hostname === 'apis.data.go.kr' && u.pathname.includes('SFMS_FACI')) {
          const pageNo = u.searchParams.get('pageNo');
          if (pageNo === '1') return Promise.resolve(jsonResponse(api1Body({ items: [API1_ITEM], totalCount: 1 })));
          throw new Error(`unexpected API1 pageNo ${pageNo}`);
        }
        if (u.pathname.includes('swimming_pools')) {
          const pageNo = u.searchParams.get('pageNo');
          if (pageNo === '1') return Promise.resolve(jsonResponse(api2Body({ items: [API2_ITEM], totalCount: 1 })));
          throw new Error(`unexpected API2 pageNo ${pageNo}`);
        }
        throw new Error(`unexpected url ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new SwimmingPoolAdapter();
      const { api1Items, api2Items } = await adapter.fetch();

      expect(api1Items).toHaveLength(1);
      expect(api2Items).toHaveLength(1);
    });

    // [외부 공공 API 배치 수집 안정성 및 독립 실행 구조 고도화](2026-09-01 사용자 지시):
    // API1/API2가 완전히 독립이므로 하나가 에러 응답을 반환해도 fetch() 전체가 실패해서는
    // 안 되고, 실패한 쪽만 빈 배열로 격리되고 성공한 쪽 데이터는 그대로 반환돼야 한다.
    it('API1만 resultCode 에러여도 fetch() 전체가 실패하지 않고 API1만 격리된다', async () => {
      vi.stubGlobal('fetch', vi.fn((url) => {
        const u = new URL(url);
        if (u.pathname.includes('SFMS_FACI')) {
          return Promise.resolve(jsonResponse(api1Body({ resultCode: '30', items: [] })));
        }
        return Promise.resolve(jsonResponse(api2Body({ items: [API2_ITEM] })));
      }));

      const adapter = new SwimmingPoolAdapter();
      const { api1Items, api2Items } = await adapter.fetch();

      expect(api1Items).toEqual([]);
      expect(api2Items).toHaveLength(1);
    });

    it('API2만 resultCode 에러여도 fetch() 전체가 실패하지 않고 API2만 격리된다', async () => {
      vi.stubGlobal('fetch', vi.fn((url) => {
        const u = new URL(url);
        if (u.pathname.includes('swimming_pools')) {
          return Promise.resolve(jsonResponse(api2Body({ resultCode: '30', items: [] })));
        }
        return Promise.resolve(jsonResponse(api1Body({ items: [API1_ITEM] })));
      }));

      const adapter = new SwimmingPoolAdapter();
      const { api1Items, api2Items } = await adapter.fetch();

      expect(api1Items).toHaveLength(1);
      expect(api2Items).toEqual([]);
    });

    it('API1/API2가 모두 에러 응답이면 fetch()가 예외를 던진다', async () => {
      vi.stubGlobal('fetch', vi.fn((url) => {
        const u = new URL(url);
        if (u.pathname.includes('SFMS_FACI')) return Promise.resolve(jsonResponse(api1Body({ resultCode: '30', items: [] })));
        return Promise.resolve(jsonResponse(api2Body({ resultCode: '30', items: [] })));
      }));

      const adapter = new SwimmingPoolAdapter();
      await expect(adapter.fetch()).rejects.toThrow(/API1.*API2/s);
    });
  });

  describe('transform', () => {
    it('API1/API2 정상 시설을 open_spaces 표준 스키마 행으로 변환한다', () => {
      const adapter = new SwimmingPoolAdapter();
      const rows = adapter.transform({ api1Items: [API1_ITEM], api2Items: [API2_ITEM] });

      expect(rows).toHaveLength(2);

      const api1Row = rows.find((r) => r.external_id.startsWith('SWIMMING_POOL_A1_'));
      expect(api1Row).toMatchObject({
        external_id: 'SWIMMING_POOL_A1_C26D809A652359B7EF075D5EBFAEB928',
        source_type: 'SWIMMING_POOL',
        name: '이천스포츠센터실내 수영장',
        category: 'KIDS_ACTIVITY',
        facility_type: '실내',
        is_free: true,
        is_kids_friendly: false,
      });

      const api2Row = rows.find((r) => r.external_id.startsWith('SWIMMING_POOL_A2_'));
      expect(api2Row).toMatchObject({
        source_type: 'SWIMMING_POOL',
        name: '용천초어울림센터',
        category: 'KIDS_ACTIVITY',
        facility_type: '복합',
        is_free: null,
      });

      const match = api2Row.location.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const [, lng, lat] = match;
      expect(Number(lng)).toBeCloseTo(127.205, 2);
      expect(Number(lat)).toBeCloseTo(37.191, 2);
    });

    it('faci_stat_nm이 폐업이면 API1 항목을 제외한다', () => {
      const adapter = new SwimmingPoolAdapter();
      const rows = adapter.transform({
        api1Items: [{ ...API1_ITEM, faci_stat_nm: '폐업' }],
        api2Items: [],
      });
      expect(rows).toEqual([]);
    });

    it('SALS_STTS_NM이 영업/정상이 아니면 API2 항목을 제외한다', () => {
      const adapter = new SwimmingPoolAdapter();
      const rows = adapter.transform({
        api1Items: [],
        api2Items: [{ ...API2_ITEM, SALS_STTS_NM: '폐업' }],
      });
      expect(rows).toEqual([]);
    });

    it('inout_gbn_nm이 실외이면 facility_type을 야외로 매핑한다', () => {
      const adapter = new SwimmingPoolAdapter();
      const rows = adapter.transform({
        api1Items: [{ ...API1_ITEM, inout_gbn_nm: '실외' }],
        api2Items: [],
      });
      expect(rows[0].facility_type).toBe('야외');
    });

    it('faci_gb_nm이 공공이 아니면 is_free를 null로 판별한다', () => {
      const adapter = new SwimmingPoolAdapter();
      const rows = adapter.transform({
        api1Items: [{ ...API1_ITEM, faci_gb_nm: '민간' }],
        api2Items: [],
      });
      expect(rows[0].is_free).toBeNull();
    });

    it('PBP_SE_NM이 공립이면 is_free를 true로 판별한다', () => {
      const adapter = new SwimmingPoolAdapter();
      const rows = adapter.transform({
        api1Items: [],
        api2Items: [{ ...API2_ITEM, PBP_SE_NM: '공립' }],
      });
      expect(rows[0].is_free).toBe(true);
    });

    it('시설명+주소(공백 무시)가 같으면 API2 중복 항목을 제외하고 API1을 우선한다', () => {
      const adapter = new SwimmingPoolAdapter();
      const duplicateApi2Item = {
        ...API2_ITEM,
        BPLC_NM: API1_ITEM.faci_nm,
        ROAD_NM_ADDR: API1_ITEM.faci_road_addr,
      };
      const rows = adapter.transform({
        api1Items: [API1_ITEM],
        api2Items: [duplicateApi2Item],
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].external_id).toBe('SWIMMING_POOL_A1_C26D809A652359B7EF075D5EBFAEB928');
    });

    it('API2 MNG_NO가 서로 다른 시설 간에 중복돼도(실측 확인된 이슈) external_id는 충돌하지 않는다', () => {
      const adapter = new SwimmingPoolAdapter();
      const sameMngNoDifferentPools = [
        { ...API2_ITEM, MNG_NO: 'CDFH3301012026000001', BPLC_NM: '스윔박스', ROAD_NM_ADDR: '인천광역시 계양구 계양문화로 21' },
        { ...API2_ITEM, MNG_NO: 'CDFH3301012026000001', BPLC_NM: '블루스카이풀', ROAD_NM_ADDR: '강원특별자치도 정선군 사북읍 하이원길 265' },
      ];
      const rows = adapter.transform({ api1Items: [], api2Items: sameMngNoDifferentPools });

      expect(rows).toHaveLength(2);
      expect(rows[0].external_id).not.toBe(rows[1].external_id);
    });

    it('시설명/주소/좌표 중 하나라도 없으면 해당 항목을 건너뛴다', () => {
      const adapter = new SwimmingPoolAdapter();
      const rows = adapter.transform({
        api1Items: [{ ...API1_ITEM, faci_nm: '' }, { ...API1_ITEM, faci_lat: '', faci_lot: '' }],
        api2Items: [{ ...API2_ITEM, BPLC_NM: '' }],
      });
      expect(rows).toEqual([]);
    });

    describe('is_kids_friendly 키워드 매핑 (2026-08-21 정밀화)', () => {
      it.each(['어린이', '유아', '키즈', '영유아', '유아풀', '어린이풀', '키즈풀'])(
        '시설명에 "%s" 키워드가 포함되면 API1 항목의 is_kids_friendly를 true로 매핑한다',
        (keyword) => {
          const adapter = new SwimmingPoolAdapter();
          const rows = adapter.transform({
            api1Items: [{ ...API1_ITEM, faci_nm: `대전 ${keyword} 수영장` }],
            api2Items: [],
          });
          expect(rows[0].is_kids_friendly).toBe(true);
        }
      );

      it('사업장명에 키워드가 포함되면 API2 항목의 is_kids_friendly를 true로 매핑한다', () => {
        const adapter = new SwimmingPoolAdapter();
        const rows = adapter.transform({
          api1Items: [],
          api2Items: [{ ...API2_ITEM, BPLC_NM: '뽀롱이 키즈풀' }],
        });
        expect(rows[0].is_kids_friendly).toBe(true);
      });

      it('키워드가 없으면 기존대로 is_kids_friendly를 false로 유지한다', () => {
        const adapter = new SwimmingPoolAdapter();
        const rows = adapter.transform({
          api1Items: [API1_ITEM],
          api2Items: [API2_ITEM],
        });
        expect(rows.every((r) => r.is_kids_friendly === false)).toBe(true);
      });
    });
  });

  describe('matchesKidsKeyword', () => {
    it('여러 텍스트 인자 중 하나라도 키워드를 포함하면 true를 반환한다', () => {
      expect(matchesKidsKeyword('일반 수영장', '유아 전용 강습')).toBe(true);
    });

    it('키워드가 전혀 없으면 false를 반환한다', () => {
      expect(matchesKidsKeyword('시민 스포츠센터 수영장', '경기도 이천시')).toBe(false);
    });

    it('빈 값/undefined가 섞여도 안전하게 처리한다', () => {
      expect(matchesKidsKeyword(undefined, '', '어린이 수영장')).toBe(true);
    });
  });
});
