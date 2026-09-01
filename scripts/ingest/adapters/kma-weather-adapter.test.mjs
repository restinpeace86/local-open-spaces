import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectWeatherForSpots,
  fetchUltraSrtNcst,
  fetchVilageFcst,
  groupSpotsByGrid,
  parseUltraSrtNcstItems,
  parseVilageFcstItems,
  upsertWeatherCaches,
} from './kma-weather-adapter.mjs';

function jsonResponse(body) {
  return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) };
}

function vilageFcstBody({ resultCode = '00', resultMsg = '정상', items = [] } = {}) {
  return { response: { header: { resultCode, resultMsg }, body: { items: { item: items } } } };
}

function fcstItem(overrides = {}) {
  return { fcstDate: '20260901', fcstTime: '0900', category: 'TMP', fcstValue: '23.5', ...overrides };
}

describe('parseVilageFcstItems', () => {
  it('가장 이른 예보 시각의 TMP/POP/SKY/REH를 추출한다', () => {
    const items = [
      fcstItem({ category: 'TMP', fcstValue: '23.5', fcstTime: '0900' }),
      fcstItem({ category: 'POP', fcstValue: '30', fcstTime: '0900' }),
      fcstItem({ category: 'SKY', fcstValue: '1', fcstTime: '0900' }),
      fcstItem({ category: 'REH', fcstValue: '55', fcstTime: '0900' }),
      // 더 늦은 시각(1200) 예보는 무시돼야 한다.
      fcstItem({ category: 'TMP', fcstValue: '26.0', fcstTime: '1200' }),
    ];

    expect(parseVilageFcstItems(items)).toEqual({
      temperature: 23.5,
      precipitation_prob: 30,
      sky_status: '맑음',
      humidity: 55,
    });
  });

  it('SKY 코드 3/4도 각각 구름많음/흐림으로 번역한다', () => {
    expect(parseVilageFcstItems([fcstItem({ category: 'SKY', fcstValue: '3' })]).sky_status).toBe('구름많음');
    expect(parseVilageFcstItems([fcstItem({ category: 'SKY', fcstValue: '4' })]).sky_status).toBe('흐림');
  });

  it('알 수 없는 SKY 코드는 원본 값을 그대로 둔다(추측으로 라벨을 만들지 않음)', () => {
    expect(parseVilageFcstItems([fcstItem({ category: 'SKY', fcstValue: '99' })]).sky_status).toBe('99');
  });

  it('항목이 비어있으면 null을 반환한다', () => {
    expect(parseVilageFcstItems([])).toBeNull();
    expect(parseVilageFcstItems(null)).toBeNull();
  });

  it('일부 카테고리가 없으면 해당 필드만 null이다', () => {
    const result = parseVilageFcstItems([fcstItem({ category: 'TMP', fcstValue: '20' })]);
    expect(result.temperature).toBe(20);
    expect(result.precipitation_prob).toBeNull();
    expect(result.sky_status).toBeNull();
    expect(result.humidity).toBeNull();
  });
});

describe('parseUltraSrtNcstItems', () => {
  it('T1H/REH만 추출한다', () => {
    const items = [
      { category: 'T1H', obsrValue: '24.1' },
      { category: 'REH', obsrValue: '60' },
      { category: 'RN1', obsrValue: '0' },
    ];
    expect(parseUltraSrtNcstItems(items)).toEqual({ temperature: 24.1, humidity: 60 });
  });

  it('항목이 비어있으면 null이다', () => {
    expect(parseUltraSrtNcstItems([])).toBeNull();
  });
});

describe('groupSpotsByGrid', () => {
  it('같은 격자에 속한 스팟들을 하나의 그룹으로 묶는다', () => {
    const spots = [
      { id: 'a', lat: 37.5665, lng: 126.978 },
      { id: 'b', lat: 37.5665, lng: 126.978 }, // 서울시청과 동일 좌표 → 같은 격자
      { id: 'c', lat: 35.1796, lng: 129.0756 }, // 부산 → 다른 격자
    ];
    const groups = groupSpotsByGrid(spots);

    expect(groups).toHaveLength(2);
    const seoulGroup = groups.find((g) => g.spotIds.includes('a'));
    expect(seoulGroup.spotIds.sort()).toEqual(['a', 'b']);
    expect(seoulGroup.nx).toBe(60);
    expect(seoulGroup.ny).toBe(127);
  });
});

describe('KMA API 호출(fetchVilageFcst/fetchUltraSrtNcst)', () => {
  const ORIGINAL_KEY = process.env.PUBLIC_DATA_API_KEY;

  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'decoded-test-key';
  });
  afterEach(() => {
    process.env.PUBLIC_DATA_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('serviceKey를 정확히 한 번만 encodeURIComponent 적용해 요청한다(이중 인코딩 방지)', async () => {
    const fetchMock = vi.fn((url) => Promise.resolve(jsonResponse(vilageFcstBody({ items: [fcstItem()] }))));
    vi.stubGlobal('fetch', fetchMock);

    await fetchVilageFcst({ nx: 60, ny: 127, baseDate: '20260901', baseTime: '0800' });

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('serviceKey=decoded-test-key');
    expect(calledUrl).not.toContain('%2520'); // 이중 인코딩되면 %20이 다시 인코딩되어 %2520이 나타남
    expect(calledUrl).toContain('dataType=JSON');
    expect(calledUrl).toContain('nx=60');
    expect(calledUrl).toContain('ny=127');
  });

  it('resultCode가 00이 아니면 에러를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(vilageFcstBody({ resultCode: '03', resultMsg: 'NODATA_ERROR' })))));

    await expect(fetchVilageFcst({ nx: 60, ny: 127, baseDate: '20260901', baseTime: '0800' })).rejects.toThrow(
      /에러 응답: 03 NODATA_ERROR/
    );
  });

  it('getUltraSrtNcst도 동일한 방식으로 items를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ response: { header: { resultCode: '00' }, body: { items: { item: [{ category: 'T1H', obsrValue: '22' }] } } } })
        )
      )
    );

    const items = await fetchUltraSrtNcst({ nx: 60, ny: 127, baseDate: '20260901', baseTime: '0900' });
    expect(items).toEqual([{ category: 'T1H', obsrValue: '22' }]);
  });
});

describe('collectWeatherForSpots — 격자 단위 격리', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.PUBLIC_DATA_API_KEY = 'decoded-test-key';
  });

  it('한 격자의 API 호출이 실패해도 다른 격자의 스팟은 정상적으로 날씨를 받는다', async () => {
    process.env.PUBLIC_DATA_API_KEY = 'decoded-test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.includes('nx=98')) {
          return Promise.resolve(jsonResponse(vilageFcstBody({ resultCode: '03', resultMsg: 'NODATA_ERROR' })));
        }
        return Promise.resolve(
          jsonResponse(
            vilageFcstBody({
              items: [
                fcstItem({ category: 'TMP', fcstValue: '20' }),
                fcstItem({ category: 'POP', fcstValue: '10' }),
                fcstItem({ category: 'SKY', fcstValue: '1' }),
                fcstItem({ category: 'REH', fcstValue: '40' }),
              ],
            })
          )
        );
      })
    );

    const spots = [
      { id: 'seoul-spot', lat: 37.5665, lng: 126.978 }, // nx=60 (성공)
      { id: 'busan-spot', lat: 35.1796, lng: 129.0756 }, // nx=98 (실패)
    ];

    const rows = await collectWeatherForSpots(spots);

    expect(rows).toHaveLength(1);
    expect(rows[0].spot_id).toBe('seoul-spot');
    expect(rows[0].temperature).toBe(20);
  });

  it('같은 격자를 공유하는 스팟은 API를 한 번만 호출하고 결과를 모두에게 복사한다', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          vilageFcstBody({
            items: [fcstItem({ category: 'TMP', fcstValue: '20' })],
          })
        )
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const spots = [
      { id: 'a', lat: 37.5665, lng: 126.978 },
      { id: 'b', lat: 37.5665, lng: 126.978 },
      { id: 'c', lat: 37.5665, lng: 126.978 },
    ];

    const rows = await collectWeatherForSpots(spots);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.temperature === 20)).toBe(true);
  });
});

describe('upsertWeatherCaches', () => {
  it('spot_id를 onConflict로 지정해 upsert한다', async () => {
    const upsertMock = vi.fn(() => Promise.resolve({ error: null }));
    const client = { from: () => ({ upsert: upsertMock }) };

    const result = await upsertWeatherCaches(client, [{ spot_id: 's1', temperature: 20 }]);

    expect(result.count).toBe(1);
    expect(upsertMock).toHaveBeenCalledWith([{ spot_id: 's1', temperature: 20 }], { onConflict: 'spot_id' });
  });

  it('행이 없으면 upsert 자체를 호출하지 않는다', async () => {
    const upsertMock = vi.fn();
    const client = { from: () => ({ upsert: upsertMock }) };

    const result = await upsertWeatherCaches(client, []);

    expect(result.count).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
