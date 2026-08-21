// Task 5: public-facility-open-adapter.mjs 단위 테스트
// - header/body가 최상위에 오는 응답 포맷 파싱 및 페이지네이션
// - pchrgUseYn(Y/N) 우선 판별 + rntfee 텍스트 Fallback을 통한 is_free 정밀 판별
// - 원본 latitude/longitude를 그대로 사용하는 open_spaces 표준 스키마 행 변환
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { PublicFacilityOpenAdapter } = await import('./public-facility-open-adapter.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function apiBody({ resultCode = '00', items = [], totalCount = items.length } = {}) {
  return {
    header: { resultCode, resultMsg: 'NORMAL SERVICE.' },
    body: { items: { item: items }, numOfRows: items.length, pageNo: 1, totalCount },
  };
}

const BASE_ITEM = {
  openFcltyNm: '용유동행정복지센터 남북동 다목적 경기장',
  openFcltyType: '다목적경기장',
  rdnmadr: '인천광역시 중구 마시란로 308-13',
  lnmadr: '인천광역시 중구 남북동 928-6',
  latitude: '37.44390144',
  longitude: '126.4024317',
  pchrgUseYn: 'N',
  rntfee: '',
  weekdayOperOpenHhmm: '06:00',
  weekdayOperColseHhmm: '23:59',
  wkendOperOpenHhmm: '06:00',
  wkendOperCloseHhmm: '23:59',
  homepageUrl: '',
  insttCode: '3491000',
};

describe('PublicFacilityOpenAdapter', () => {
  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'test-public-data-key';
    vi.restoreAllMocks();
  });

  describe('fetch (페이지네이션)', () => {
    it('totalCount에 도달할 때까지 pageNo를 증가시키며 반복 호출한다', async () => {
      // PAGE_SIZE(100)를 넘는 totalCount(101)를 줘야 (pageNo-1)*100 < totalCount 조건으로 2페이지째가 호출된다.
      const fetchMock = vi.fn((url) => {
        const pageNo = new URL(url).searchParams.get('pageNo');
        if (pageNo === '1') return Promise.resolve(jsonResponse(apiBody({ items: [BASE_ITEM], totalCount: 101 })));
        if (pageNo === '2')
          return Promise.resolve(
            jsonResponse(apiBody({ items: [{ ...BASE_ITEM, openFcltyNm: '두번째 시설' }], totalCount: 101 }))
          );
        throw new Error(`unexpected pageNo ${pageNo}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new PublicFacilityOpenAdapter();
      const items = await adapter.fetch();

      expect(items).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('resultCode가 00이 아니면 에러를 던진다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse(apiBody({ resultCode: '30', items: [] }))))
      );

      const adapter = new PublicFacilityOpenAdapter();
      await expect(adapter.fetch()).rejects.toThrow('PublicFacilityOpen 에러 응답');
    });
  });

  describe('transform', () => {
    it('원본 latitude/longitude를 그대로 사용해 open_spaces 표준 스키마 행을 생성한다', () => {
      const adapter = new PublicFacilityOpenAdapter();
      const rows = adapter.transform([BASE_ITEM]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source_type: 'PUBLIC_FACILITY_OPEN',
        name: '용유동행정복지센터 남북동 다목적 경기장',
        category: 'KIDS_ACTIVITY',
        address: '인천광역시 중구 마시란로 308-13',
        location: 'SRID=4326;POINT(126.4024317 37.44390144)',
        is_free: true,
        operating_hours: '평일 06:00~23:59, 주말 06:00~23:59',
      });
      expect(rows[0].external_id).toMatch(/^PUBLIC_FACILITY_OPEN_/);
    });

    it('pchrgUseYn=Y이면 rntfee와 무관하게 유료(false)로 판별한다', () => {
      const adapter = new PublicFacilityOpenAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, pchrgUseYn: 'Y', rntfee: '55000' }]);

      expect(rows[0].is_free).toBe(false);
    });

    it('pchrgUseYn이 없으면 rntfee 텍스트로 Fallback 판별한다', () => {
      const adapter = new PublicFacilityOpenAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, pchrgUseYn: undefined, rntfee: '무료' }]);

      expect(rows[0].is_free).toBe(true);
    });

    it('name/좌표 중 하나라도 없으면 해당 항목을 건너뛴다', () => {
      const adapter = new PublicFacilityOpenAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, latitude: '', longitude: '' }]);

      expect(rows).toEqual([]);
    });

    it('동일 시설명이라도 rawData의 실제 텍스트(어린이/주차 등)에 근거해서만 뱃지를 판별한다', () => {
      const adapter = new PublicFacilityOpenAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, etcFclty: '어린이 놀이시설, 주차장 완비, 유모차 대여' }]);

      expect(rows[0]).toMatchObject({
        is_kids_friendly: true,
        has_parking: true,
        stroller_accessible: true,
      });
    });
  });
});
