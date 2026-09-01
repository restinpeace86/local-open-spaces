import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateSidoAirQuality,
  fetchAllExactSpotsWithAddress,
  fetchCtprvnRltmMesureDnsty,
  parseAirKoreaItem,
} from './airkorea-adapter.mjs';

function jsonResponse(body) {
  return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) };
}

function airKoreaBody({ resultCode = '00', resultMsg = '정상', items = [] } = {}) {
  return { response: { header: { resultCode, resultMsg }, body: { items } } };
}

function station(overrides = {}) {
  return { stationName: '중구', pm10Value: '30', pm25Value: '15', pm10Grade: '2', pm25Grade: '1', ...overrides };
}

describe('parseAirKoreaItem', () => {
  it('pm10Value/pm25Value/pm10Grade/pm25Grade를 숫자로 파싱한다', () => {
    expect(parseAirKoreaItem(station())).toEqual({ pm10: 30, pm25: 15, pm10GradeCode: 2, pm25GradeCode: 1 });
  });

  it("'-'나 빈 문자열은 null로 방어한다(요구사항 2)", () => {
    expect(parseAirKoreaItem(station({ pm10Value: '-', pm25Value: '' }))).toEqual(
      expect.objectContaining({ pm10: null, pm25: null })
    );
  });

  it('등급 코드가 1~4 범위를 벗어나거나 숫자가 아니면 null이다', () => {
    expect(parseAirKoreaItem(station({ pm10Grade: '9' })).pm10GradeCode).toBeNull();
    expect(parseAirKoreaItem(station({ pm10Grade: '-' })).pm10GradeCode).toBeNull();
  });
});

describe('aggregateSidoAirQuality', () => {
  it('여러 측정소의 평균값을 계산하고 등급은 반올림 후 라벨로 번역한다', () => {
    const items = [
      station({ pm10Value: '20', pm25Value: '10', pm10Grade: '1', pm25Grade: '1' }),
      station({ pm10Value: '40', pm25Value: '20', pm10Grade: '3', pm25Grade: '2' }),
    ];
    expect(aggregateSidoAirQuality(items)).toEqual({
      pm10: 30,
      pm25: 15,
      pm10_grade: '보통', // round((1+3)/2)=2
      pm25_grade: '보통', // round((1+2)/2)=2(round-half-up)
    });
  });

  it("일부 측정소가 '-'라도 유효한 측정소만으로 평균을 낸다", () => {
    const items = [station({ pm10Value: '-', pm25Value: '-' }), station({ pm10Value: '50', pm25Value: '25' })];
    const result = aggregateSidoAirQuality(items);
    expect(result.pm10).toBe(50);
    expect(result.pm25).toBe(25);
  });

  it('유효 측정값이 하나도 없으면 null을 반환한다', () => {
    const items = [station({ pm10Value: '-', pm25Value: '-', pm10Grade: '-', pm25Grade: '-' })];
    expect(aggregateSidoAirQuality(items)).toBeNull();
  });

  it('items가 비어있으면 null을 반환한다', () => {
    expect(aggregateSidoAirQuality([])).toBeNull();
    expect(aggregateSidoAirQuality(null)).toBeNull();
  });
});

describe('fetchCtprvnRltmMesureDnsty', () => {
  const ORIGINAL_KEY = process.env.PUBLIC_DATA_API_KEY;

  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'decoded-test-key';
  });
  afterEach(() => {
    process.env.PUBLIC_DATA_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('serviceKey를 정확히 한 번만 encodeURIComponent 적용해 요청하고, items 배열을 그대로 반환한다(items.item로 감싸지 않음)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(airKoreaBody({ items: [station()] }))));
    vi.stubGlobal('fetch', fetchMock);

    const items = await fetchCtprvnRltmMesureDnsty({ sidoName: '서울' });

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('serviceKey=decoded-test-key');
    expect(calledUrl).not.toContain('%2520');
    expect(calledUrl).toContain('returnType=JSON');
    expect(calledUrl).toContain('sidoName=%EC%84%9C%EC%9A%B8');
    expect(items).toEqual([station()]);
  });

  it('resultCode가 00이 아니면 에러를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(airKoreaBody({ resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED ERROR' })))));

    await expect(fetchCtprvnRltmMesureDnsty({ sidoName: '서울' })).rejects.toThrow(/에러 응답: 30/);
  });
});

describe('fetchAllExactSpotsWithAddress — 커서 페이지네이션', () => {
  it('PAGE_SIZE 단위로 페이지네이션하며 address가 있는 스팟만 모은다', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${String(i).padStart(4, '0')}`, address: '서울특별시 강남구' }));
    const page2 = [{ id: 'id-1000', address: '경기도 성남시' }, { id: 'id-1001', address: null }];
    let callCount = 0;

    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => {
                const query = {
                  gt: () => query,
                  then: (resolve) => {
                    callCount += 1;
                    resolve(callCount === 1 ? { data: page1, error: null } : { data: page2, error: null });
                  },
                };
                return query;
              },
            }),
          }),
        }),
      }),
    };

    const spots = await fetchAllExactSpotsWithAddress(client);
    expect(callCount).toBe(2);
    expect(spots).toHaveLength(1001); // address가 null인 1건은 제외됨
  });
});
