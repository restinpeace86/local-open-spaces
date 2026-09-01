import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveForecastForDate, pickForecastForDate } from './kma-forecast';

function item(overrides: Partial<{ fcstDate: string; fcstTime: string; category: string; fcstValue: string }> = {}) {
  return { fcstDate: '20260902', fcstTime: '1500', category: 'TMP', fcstValue: '25', ...overrides };
}

describe('pickForecastForDate', () => {
  it('목표 날짜와 정확히 일치하는 슬롯 중 목표 시각에 가장 가까운 슬롯을 고른다', () => {
    const items = [
      item({ fcstDate: '20260902', fcstTime: '1200', category: 'TMP', fcstValue: '22' }),
      item({ fcstDate: '20260902', fcstTime: '1500', category: 'TMP', fcstValue: '25' }),
      item({ fcstDate: '20260902', fcstTime: '1500', category: 'POP', fcstValue: '30' }),
      item({ fcstDate: '20260902', fcstTime: '1500', category: 'SKY', fcstValue: '1' }),
      item({ fcstDate: '20260902', fcstTime: '1500', category: 'REH', fcstValue: '50' }),
      // 다른 날짜는 무시돼야 한다.
      item({ fcstDate: '20260903', fcstTime: '1500', category: 'TMP', fcstValue: '99' }),
    ];

    expect(pickForecastForDate(items, '20260902', 14)).toEqual({
      temperature: 25,
      precipitationProb: 30,
      skyStatus: '맑음',
      humidity: 50,
    });
  });

  it('목표 날짜의 슬롯이 응답에 아예 없으면(예보 범위 밖) null을 반환한다', () => {
    const items = [item({ fcstDate: '20260902' })];
    expect(pickForecastForDate(items, '20260910', 14)).toBeNull();
  });

  it('SKY 코드 3/4를 구름많음/흐림으로 번역한다', () => {
    const items = [item({ category: 'SKY', fcstValue: '4' })];
    expect(pickForecastForDate(items, '20260902', 15)?.skyStatus).toBe('흐림');
  });
});

describe('fetchLiveForecastForDate', () => {
  const ORIGINAL_KEY = process.env.PUBLIC_DATA_API_KEY;

  afterEach(() => {
    process.env.PUBLIC_DATA_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('실제 좌표를 격자로 변환해 KMA API를 호출하고 목표 날짜 예보를 반환한다', async () => {
    process.env.PUBLIC_DATA_API_KEY = 'decoded-test-key';
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              response: {
                header: { resultCode: '00' },
                body: { items: { item: [item({ fcstDate: '20260902', fcstTime: '1500', fcstValue: '23' })] } },
              },
            })
          ),
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLiveForecastForDate(37.5665, 126.978, '2026-09-02', 15, new Date('2026-09-01T00:15:00Z'));

    expect(result?.temperature).toBe(23);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('nx=60');
    expect(calledUrl).toContain('ny=127');
    expect(calledUrl).toContain('serviceKey=decoded-test-key');
  });

  it('PUBLIC_DATA_API_KEY가 없으면 에러를 던진다', async () => {
    delete process.env.PUBLIC_DATA_API_KEY;
    await expect(fetchLiveForecastForDate(37.5665, 126.978, '2026-09-02', 15)).rejects.toThrow(/PUBLIC_DATA_API_KEY/);
  });
});
