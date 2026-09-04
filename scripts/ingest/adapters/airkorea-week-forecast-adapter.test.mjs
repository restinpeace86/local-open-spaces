import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildForecastRows,
  fetchWeekForecast,
  parseRegionGradeText,
  upsertWeekForecasts,
} from './airkorea-week-forecast-adapter.mjs';

function jsonResponse(body) {
  return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) };
}

function airKoreaBody({ resultCode = '00', resultMsg = '정상', items = [] } = {}) {
  return { response: { header: { resultCode, resultMsg }, body: { items } } };
}

function weekItem(overrides = {}) {
  return {
    presnatnDt: '2026-09-04',
    gwthcnd: "[9월 7일∼9월 10일] 원활한 대기 확산으로 전 권역에서 '낮음'이 예상됩니다.",
    frcstOneDt: '2026-09-07',
    frcstOneCn: '서울 : 낮음, 경기북부 : 낮음, 신뢰도 : 높음',
    frcstTwoDt: '2026-09-08',
    frcstTwoCn: '서울 : 보통, 경기북부 : 낮음, 신뢰도 : 보통',
    frcstThreeDt: '2026-09-09',
    frcstThreeCn: '서울 : 낮음, 경기북부 : 낮음, 신뢰도 : 높음',
    frcstFourDt: '2026-09-10',
    frcstFourCn: '서울 : 낮음, 경기북부 : 낮음, 신뢰도 : 높음',
    ...overrides,
  };
}

// [개선사항9 - 에어코리아 주간예보 연동](2026-09-04 todo.md): 실측으로 확인한 실제
// 응답 구조("지역명 : 등급, ..., 신뢰도 : 등급" 텍스트)를 파싱하는 로직을 검증한다.
describe('parseRegionGradeText', () => {
  it('"지역 : 등급" 쌍을 배열로, 마지막 "신뢰도"는 별도로 파싱한다', () => {
    expect(parseRegionGradeText('서울 : 낮음, 경기북부 : 보통, 신뢰도 : 높음')).toEqual({
      regionGrades: [
        { region: '서울', grade: '낮음' },
        { region: '경기북부', grade: '보통' },
      ],
      reliability: '높음',
    });
  });

  it('빈 문자열/null이면 빈 배열과 null을 반환한다', () => {
    expect(parseRegionGradeText('')).toEqual({ regionGrades: [], reliability: null });
    expect(parseRegionGradeText(null)).toEqual({ regionGrades: [], reliability: null });
  });
});

describe('buildForecastRows', () => {
  it('발표문 1건을 대상일 4건(행 4개)으로 정규화한다', () => {
    const rows = buildForecastRows(weekItem());

    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      announced_date: '2026-09-04',
      forecast_date: '2026-09-07',
      summary: "[9월 7일∼9월 10일] 원활한 대기 확산으로 전 권역에서 '낮음'이 예상됩니다.",
      region_grades: [
        { region: '서울', grade: '낮음' },
        { region: '경기북부', grade: '낮음' },
      ],
      reliability: '높음',
      raw_forecast_text: '서울 : 낮음, 경기북부 : 낮음, 신뢰도 : 높음',
    });
    // 4개 행 모두 같은 발표(summary/announced_date)를 공유하되, 대상일과 등급 텍스트는 각자 다르다.
    expect(rows[1].forecast_date).toBe('2026-09-08');
    expect(rows[1].reliability).toBe('보통');
    expect(rows.every((r) => r.summary === rows[0].summary)).toBe(true);
  });

  it('대상일 날짜 필드 자체가 없으면 그 날짜의 행을 만들지 않는다(추측 금지)', () => {
    const rows = buildForecastRows(weekItem({ frcstFourDt: undefined }));
    expect(rows).toHaveLength(3);
  });
});

describe('fetchWeekForecast', () => {
  const ORIGINAL_KEY = process.env.PUBLIC_DATA_API_KEY;

  beforeEach(() => {
    process.env.PUBLIC_DATA_API_KEY = 'decoded-test-key';
  });
  afterEach(() => {
    process.env.PUBLIC_DATA_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('searchDate를 생략하면 오늘 날짜로 조회하고 items 배열을 그대로 반환한다', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(airKoreaBody({ items: [weekItem()] }))));
    vi.stubGlobal('fetch', fetchMock);

    const items = await fetchWeekForecast({ searchDate: '2026-09-04' });

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/getMinuDustWeekFrcstDspth');
    expect(calledUrl).toContain('searchDate=2026-09-04');
    expect(items).toEqual([weekItem()]);
  });

  it('resultCode가 00이 아니면 에러를 던진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(airKoreaBody({ resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED ERROR' }))))
    );

    await expect(fetchWeekForecast({ searchDate: '2026-09-04' })).rejects.toThrow(/에러 응답: 30/);
  });
});

describe('upsertWeekForecasts', () => {
  it('(announced_date, forecast_date)를 onConflict로 지정해 upsert한다', async () => {
    const upsertMock = vi.fn(() => Promise.resolve({ error: null }));
    const client = { from: () => ({ upsert: upsertMock }) };
    const row = { announced_date: '2026-09-04', forecast_date: '2026-09-07' };

    const result = await upsertWeekForecasts(client, [row]);

    expect(result.count).toBe(1);
    expect(upsertMock).toHaveBeenCalledWith([row], { onConflict: 'announced_date,forecast_date' });
  });

  it('행이 없으면 upsert 자체를 호출하지 않는다', async () => {
    const upsertMock = vi.fn();
    const client = { from: () => ({ upsert: upsertMock }) };

    const result = await upsertWeekForecasts(client, []);

    expect(result.count).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
