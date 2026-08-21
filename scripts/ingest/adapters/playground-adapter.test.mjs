// Task 7-1: playground-adapter.mjs 단위 테스트
// - response.header.resultCode('00')/OpenAPI_ServiceResponse 두 봉투 모두 처리하는 응답 파싱 및 페이지네이션
// - exfcYn('Y')/clsgYmd(폐쇄일자) 기준 폐쇄 시설 필터링
// - prvtPblcYnCdNm('공공'/'민간') 기준 is_free 레코드별 판별, is_kids_friendly 소스 레벨 고정(true)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { PlaygroundAdapter } = await import('./playground-adapter.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function apiBody({ resultCode = '00', items = [], totalCnt = items.length } = {}) {
  return {
    response: {
      header: { resultCode, resultMsg: 'NORMAL SERVICE' },
      body: { recordCountPerPage: items.length, pageIndex: 1, totalPageCnt: 1, totalCnt, items },
    },
  };
}

// 실측 표본(경기도 안산시 단원구 안산천서로 23): latCrtsVl/lotCrtsVl가 이미 WGS84 십진 위경도로
// 실제 위치와 일치함을 확인한 값 그대로 사용한다.
const BASE_ITEM = {
  pfctSn: '1008140',
  pfctNm: '동네 놀이터',
  ronaAddr: '경기 안산시 단원구 안산천서로 23',
  lotnoAddr: '경기 안산시 단원구 고잔동 123-4',
  latCrtsVl: '37.3182363',
  lotCrtsVl: '126.8419032',
  exfcYn: 'N',
  clsgYmd: null,
  prvtPblcYnCd: 'C002',
  prvtPblcYnCdNm: '공공',
  idrodrCd: 'O002',
  idrodrCdNm: '실외',
};

describe('PlaygroundAdapter', () => {
  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'test-public-data-key';
    vi.restoreAllMocks();
  });

  describe('fetch (페이지네이션)', () => {
    it('totalCnt에 도달할 때까지 pageIndex를 증가시키며 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        const pageIndex = new URL(url).searchParams.get('pageIndex');
        if (pageIndex === '1')
          return Promise.resolve(jsonResponse(apiBody({ items: [BASE_ITEM], totalCnt: 1001 })));
        if (pageIndex === '2')
          return Promise.resolve(
            jsonResponse(apiBody({ items: [{ ...BASE_ITEM, pfctSn: '1008141' }], totalCnt: 1001 }))
          );
        throw new Error(`unexpected pageIndex ${pageIndex}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new PlaygroundAdapter();
      const items = await adapter.fetch();

      expect(items).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('response.header.resultCode가 00이 아니면 에러를 던진다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse(apiBody({ resultCode: '30', items: [] }))))
      );

      const adapter = new PlaygroundAdapter();
      await expect(adapter.fetch()).rejects.toThrow('Playground 에러 응답');
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

      const adapter = new PlaygroundAdapter();
      await expect(adapter.fetch()).rejects.toThrow('SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
    });
  });

  describe('transform', () => {
    it('exfcYn이 Y(폐쇄)이면 제외한다', () => {
      const adapter = new PlaygroundAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, exfcYn: 'Y' }]);
      expect(rows).toEqual([]);
    });

    it('clsgYmd(폐쇄일자)가 있으면 제외한다', () => {
      const adapter = new PlaygroundAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, clsgYmd: '20250101' }]);
      expect(rows).toEqual([]);
    });

    it('정상 시설을 open_spaces 표준 스키마 행으로 변환한다', () => {
      const adapter = new PlaygroundAdapter();
      const rows = adapter.transform([BASE_ITEM]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        external_id: 'LOCALDATA_PLAYGROUND_1008140',
        source_type: 'LOCALDATA_PLAYGROUND',
        name: '동네 놀이터',
        category: 'KIDS_ACTIVITY',
        address: '경기 안산시 단원구 안산천서로 23',
        is_kids_friendly: true,
        facility_type: '야외',
      });

      const match = rows[0].location.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const [, lng, lat] = match;
      expect(Number(lng)).toBeCloseTo(126.8419, 3);
      expect(Number(lat)).toBeCloseTo(37.3182, 3);
    });

    it('ronaAddr이 없으면 lotnoAddr로 대체한다', () => {
      const adapter = new PlaygroundAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, ronaAddr: '' }]);
      expect(rows[0].address).toBe('경기 안산시 단원구 고잔동 123-4');
    });

    it('시설명/주소/좌표 중 하나라도 없으면 해당 항목을 건너뛴다', () => {
      const adapter = new PlaygroundAdapter();
      const rows = adapter.transform([
        { ...BASE_ITEM, pfctNm: '' },
        { ...BASE_ITEM, ronaAddr: '', lotnoAddr: '' },
        { ...BASE_ITEM, latCrtsVl: '', lotCrtsVl: '' },
      ]);
      expect(rows).toEqual([]);
    });

    it('prvtPblcYnCdNm이 공공이면 is_free true, 민간이면 null로 판별한다', () => {
      const adapter = new PlaygroundAdapter();
      const publicRows = adapter.transform([BASE_ITEM]);
      const privateRows = adapter.transform([
        { ...BASE_ITEM, prvtPblcYnCd: 'C001', prvtPblcYnCdNm: '민간' },
      ]);

      expect(publicRows[0].is_free).toBe(true);
      expect(privateRows[0].is_free).toBeNull();
    });

    it('idrodrCdNm이 실내이면 facility_type을 실내로 매핑한다', () => {
      const adapter = new PlaygroundAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, idrodrCdNm: '실내' }]);
      expect(rows[0].facility_type).toBe('실내');
    });
  });
});
