// Task 2: city-park-adapter.mjs 단위 테스트 (레거시 city-parks.mjs → BaseCollectorAdapter 마이그레이션)
// - header.resultCode('00') 응답 파싱 및 페이지네이션
// - manageNo 기반 external_id 유지 및 open_spaces 표준 스키마 행 변환
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { CityParkAdapter } = await import('./city-park-adapter.mjs');

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
  manageNo: '41287-00055',
  parkNm: '국제전시2단계(제1호문화공원)',
  parkSe: '문화공원',
  rdnmadr: '',
  lnmadr: '경기도 고양시 일산서구 대화동 2718',
  latitude: '37.66684436',
  longitude: '126.7432461',
  parkAr: '4457',
  mvmFclty: '',
  amsmtFclty: '',
  cnvnncFclty: '',
  cltrFclty: '',
  etcFclty: '',
  insttCode: '3940000',
  insttNm: '경기도 고양시',
};

describe('CityParkAdapter', () => {
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
            jsonResponse(apiBody({ items: [{ ...BASE_ITEM, manageNo: '41287-00056' }], totalCount: 101 }))
          );
        throw new Error(`unexpected pageNo ${pageNo}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new CityParkAdapter();
      const items = await adapter.fetch();

      expect(items).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('resultCode가 00이 아니면 에러를 던진다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse(apiBody({ resultCode: '30', items: [] }))))
      );

      const adapter = new CityParkAdapter();
      await expect(adapter.fetch()).rejects.toThrow('CityPark 에러 응답');
    });
  });

  describe('transform', () => {
    it('manageNo 기반 external_id를 유지하며 open_spaces 표준 스키마 행을 생성한다', () => {
      const adapter = new CityParkAdapter();
      const rows = adapter.transform([BASE_ITEM]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        external_id: 'CITY_PARK_41287-00055',
        source_type: 'CITY_PARK',
        name: '국제전시2단계(제1호문화공원)',
        category: 'OUTDOOR_NATURE',
        address: '경기도 고양시 일산서구 대화동 2718',
        location: 'SRID=4326;POINT(126.7432461 37.66684436)',
        is_free: true,
        operating_hours: null,
      });
    });

    it('rdnmadr이 없으면 lnmadr로 대체한다', () => {
      const adapter = new CityParkAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, rdnmadr: '', lnmadr: '경기도 고양시 일산서구 탄현동 1637' }]);

      expect(rows[0].address).toBe('경기도 고양시 일산서구 탄현동 1637');
    });

    it('이름/관리번호/좌표 중 하나라도 없으면 해당 항목을 건너뛴다', () => {
      const adapter = new CityParkAdapter();
      const rows = adapter.transform([
        { ...BASE_ITEM, parkNm: '' },
        { ...BASE_ITEM, manageNo: '' },
        { ...BASE_ITEM, latitude: '', longitude: '' },
      ]);

      expect(rows).toEqual([]);
    });

    it('동일 공원명이라도 rawData의 실제 텍스트(어린이/주차 등)에 근거해서만 뱃지를 판별한다', () => {
      const adapter = new CityParkAdapter();
      const rows = adapter.transform([{ ...BASE_ITEM, etcFclty: '어린이 놀이시설, 주차장 완비, 유모차 대여' }]);

      expect(rows[0]).toMatchObject({
        is_kids_friendly: true,
        has_parking: true,
        stroller_accessible: true,
      });
    });
  });
});
