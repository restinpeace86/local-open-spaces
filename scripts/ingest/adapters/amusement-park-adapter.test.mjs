// Task 4: amusement-park-adapter.mjs 단위 테스트
// - response.header.resultCode('0')/OpenAPI_ServiceResponse 두 봉투 모두 처리하는 응답 파싱 및 페이지네이션
// - DTL_SALS_STTS_NM('영업중') 상태 필터링
// - CRD_INFO_X/Y(EPSG:5174) → WGS84 좌표 변환을 통한 open_spaces 표준 스키마 행 변환
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { AmusementParkAdapter } = await import('./amusement-park-adapter.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function apiBody({ resultCode = '0', items = [], totalCount = items.length } = {}) {
  return {
    response: {
      header: { resultCode, resultMsg: '정상' },
      body: { dataType: 'JSON', items: { item: items }, numOfRows: items.length, pageNo: 1, totalCount },
    },
  };
}

// 실측 표본(경기도 남양주시 금곡동): CRD_INFO_X/Y → EPSG:5174 변환 시 (lat 37.633, lng 127.204)로
// 남양주시 좌표와 일치함을 확인한 값 그대로 사용한다.
const BASE_ITEM = {
  BPLC_NM: '(주)루시드커뮤니케이션즈',
  CULTR_SPTS_TPBIZ_NM: '신고테마파크업',
  ROAD_NM_ADDR: '경기도 남양주시 경춘로 946 (금곡동)',
  LOTNO_ADDR: '경기도 남양주시 금곡동 434-5',
  CRD_INFO_X: '218170.926606382',
  CRD_INFO_Y: '458956.330168503',
  DTL_SALS_STTS_CD: '13',
  DTL_SALS_STTS_NM: '영업중',
  SALS_STTS_CD: '01',
  SALS_STTS_NM: '영업/정상',
  MNG_NO: 'CDFI5272002026000005',
};

describe('AmusementParkAdapter', () => {
  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'test-public-data-key';
    vi.restoreAllMocks();
  });

  describe('fetch (페이지네이션)', () => {
    it('totalCount에 도달할 때까지 pageNo를 증가시키며 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        const pageNo = new URL(url).searchParams.get('pageNo');
        if (pageNo === '1') return Promise.resolve(jsonResponse(apiBody({ items: [BASE_ITEM], totalCount: 101 })));
        if (pageNo === '2')
          return Promise.resolve(
            jsonResponse(apiBody({ items: [{ ...BASE_ITEM, BPLC_NM: '두번째 시설' }], totalCount: 101 }))
          );
        throw new Error(`unexpected pageNo ${pageNo}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new AmusementParkAdapter();
      const items = await adapter.fetch();

      expect(items).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('response.header.resultCode가 0이 아니면 에러를 던진다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse(apiBody({ resultCode: '30', items: [] }))))
      );

      const adapter = new AmusementParkAdapter();
      await expect(adapter.fetch()).rejects.toThrow('AmusementPark 에러 응답');
    });

    it('OpenAPI_ServiceResponse 에러 봉투(서비스키 미등록 등)를 받으면 에러를 던진다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            jsonResponse({
              OpenAPI_ServiceResponse: {
                cmmMsgHeader: {
                  errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
                  returnAuthMsg: '등록되지 않은 서비스키',
                  returnReasonCode: '30',
                },
              },
            })
          )
        )
      );

      const adapter = new AmusementParkAdapter();
      await expect(adapter.fetch()).rejects.toThrow('SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
    });
  });

  describe('transform', () => {
    it('DTL_SALS_STTS_NM이 영업중이 아니면 제외한다', () => {
      const adapter = new AmusementParkAdapter();
      const rows = adapter.transform([
        { ...BASE_ITEM, DTL_SALS_STTS_NM: '폐업' },
        { ...BASE_ITEM, DTL_SALS_STTS_NM: '조건이행완료' },
      ]);

      expect(rows).toEqual([]);
    });

    it('EPSG:5174 좌표를 WGS84로 변환해 open_spaces 표준 스키마 행을 생성한다', () => {
      const adapter = new AmusementParkAdapter();
      const rows = adapter.transform([BASE_ITEM]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source_type: 'LOCALDATA_AMUSEMENT',
        name: '(주)루시드커뮤니케이션즈',
        category: 'ETC',
        address: '경기도 남양주시 경춘로 946 (금곡동)',
        is_free: null,
      });
      expect(rows[0].external_id).toMatch(/^LOCALDATA_AMUSEMENT_/);

      const match = rows[0].location.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const [, lng, lat] = match;
      expect(Number(lng)).toBeCloseTo(127.2038, 3);
      expect(Number(lat)).toBeCloseTo(37.6328, 3);
    });

    it('ROAD_NM_ADDR이 없으면 LOTNO_ADDR로 대체한다', () => {
      const adapter = new AmusementParkAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, ROAD_NM_ADDR: '' }]);

      expect(rows[0].address).toBe('경기도 남양주시 금곡동 434-5');
    });

    it('사업장명/주소/좌표 중 하나라도 없으면 해당 항목을 건너뛴다', () => {
      const adapter = new AmusementParkAdapter();
      const rows = adapter.transform([
        { ...BASE_ITEM, BPLC_NM: '' },
        { ...BASE_ITEM, ROAD_NM_ADDR: '', LOTNO_ADDR: '' },
        { ...BASE_ITEM, CRD_INFO_X: '', CRD_INFO_Y: '' },
      ]);

      expect(rows).toEqual([]);
    });

    it('동일 사업장명이라도 rawData의 실제 텍스트(어린이/주차 등)에 근거해서만 뱃지를 판별한다', () => {
      const adapter = new AmusementParkAdapter();
      const rows = adapter.transform([
        { ...BASE_ITEM, FBCTN_HNDL_ITEM_CN: '어린이 놀이시설, 주차장 완비, 유모차 대여' },
      ]);

      expect(rows[0]).toMatchObject({
        is_kids_friendly: true,
        has_parking: true,
        stroller_accessible: true,
      });
    });
  });
});
