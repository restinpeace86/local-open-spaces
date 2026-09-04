import { describe, expect, it, vi } from 'vitest';
import { buildProactiveWeatherSuggestion, buildWeatherReactionText, recommendMode, resolveWeatherSnapshot, WeatherSnapshot } from './weather-reaction';
import * as kmaForecast from './kma-forecast';

function snapshot(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    available: true,
    temperature: 24,
    precipitationProb: 10,
    skyStatus: '맑음',
    humidity: 50,
    pm10Grade: '좋음',
    pm25Grade: '좋음',
    airQualityAvailable: true,
    ...overrides,
  };
}

describe('recommendMode', () => {
  it('강수확률이 낮고 대기질이 좋으면 야외를 권장한다', () => {
    expect(recommendMode(snapshot())).toBe('OUTDOOR');
  });

  it('강수확률이 높으면 실내를 권장한다', () => {
    expect(recommendMode(snapshot({ precipitationProb: 70 }))).toBe('INDOOR');
  });

  it("대기질이 '나쁨'이면 강수확률이 낮아도 실내를 권장한다", () => {
    expect(recommendMode(snapshot({ pm10Grade: '나쁨' }))).toBe('INDOOR');
  });

  it('애매한 값(강수확률 30~50%)이면 둘 다를 권장한다', () => {
    expect(recommendMode(snapshot({ precipitationProb: 40 }))).toBe('EITHER');
  });

  it('데이터가 없으면 둘 다를 권장한다(추측하지 않음)', () => {
    expect(recommendMode(snapshot({ available: false }))).toBe('EITHER');
  });

  it('대기질 정보가 없는(미래 날짜) 경우 강수확률만으로 판단한다', () => {
    expect(recommendMode(snapshot({ airQualityAvailable: false, pm10Grade: null, pm25Grade: null }))).toBe('OUTDOOR');
  });
});

describe('buildWeatherReactionText', () => {
  it('이전 답변(이동 거리) 맥락을 받아치는 문장으로 시작한다', () => {
    const text = buildWeatherReactionText(snapshot(), '2026-09-01', true);
    expect(text).toContain('이동 거리까지 접수 완료했습니다');
    expect(text).toContain('강수확률 10%');
    expect(text).toContain("미세먼지 '좋음'");
  });

  // [개선사항5 - 봇 추천 단어 필터링](2026-09-04): 야외 제안 문구에 "공원"이라는
  // 단어가 더 이상 없어야 한다.
  it('야외(OUTDOOR) 제안 문구에는 "공원"이라는 단어를 쓰지 않는다', () => {
    const text = buildWeatherReactionText(snapshot(), '2026-09-01', true);
    expect(text).not.toContain('공원');
  });

  it('미래 날짜에는 미세먼지를 그 날이 되어야 안다고 정직하게 안내한다', () => {
    const text = buildWeatherReactionText(
      snapshot({ airQualityAvailable: false, pm10Grade: null, pm25Grade: null }),
      '2026-09-05',
      false
    );
    expect(text).toContain('그 날이 가까워져야');
    expect(text).not.toContain('미세먼지 \'');
  });

  it('날씨 데이터를 확보하지 못하면 정직하게 안내하고 선택을 유도한다', () => {
    const text = buildWeatherReactionText(
      { available: false, temperature: null, precipitationProb: null, skyStatus: null, humidity: null, pm10Grade: null, pm25Grade: null, airQualityAvailable: false },
      '2026-09-01',
      true
    );
    expect(text).toContain('아직 근처 예보 데이터를 확보하지 못했어요');
  });
});

// [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시) Step 1: 챗봇 실행
// 시 먼저 던지는 선제적 제안 문구 — 요구사항 원문 예시 톤을 그대로 검증한다.
describe('buildProactiveWeatherSuggestion', () => {
  // [개선사항5 - 봇 추천 단어 필터링](2026-09-04): "'공원' 단어 배제, '야외 이벤트'/
  // '야외 나들이' 위주로 자연스럽게 제안" — 특정 시설명 대신 성격으로만 제안하는지 검증.
  it('맑은 날씨(OUTDOOR)면 "공원"이라는 단어 없이 야외 이벤트/나들이를 제안한다', () => {
    const text = buildProactiveWeatherSuggestion(snapshot(), '2026-09-01', true);
    expect(text).toContain('오늘 날씨가 화창하고 참 좋네요');
    expect(text).toContain('야외 이벤트 위주로 알아볼까요?');
    expect(text).not.toContain('공원');
  });

  it('비/흐림(INDOOR)이면 요구사항 예시 그대로 실내를 제안한다', () => {
    const text = buildProactiveWeatherSuggestion(snapshot({ precipitationProb: 70 }), '2026-09-01', true);
    expect(text).toContain('구름이 많거나 비가 오네요');
    expect(text).toContain('실내 위주로 알아볼까요?');
  });

  it('오늘이 아닌 날짜면 "선택하신 날짜(...)"로 안내한다', () => {
    const text = buildProactiveWeatherSuggestion(snapshot(), '2026-09-05', false);
    expect(text).toContain('선택하신 날짜(2026-09-05)');
  });

  it('날씨 데이터가 없으면 정직하게 안내하고 선택을 유도한다', () => {
    const text = buildProactiveWeatherSuggestion(
      { available: false, temperature: null, precipitationProb: null, skyStatus: null, humidity: null, pm10Grade: null, pm25Grade: null, airQualityAvailable: false },
      '2026-09-01',
      true
    );
    expect(text).toContain('야외/실내 중 어디로 가고 싶으신지');
  });

  // [챗봇 개선](2026-09-04 사용자 지시) 2: "구체적인 수치 알려줘 — 온도랑 강수확률,
  // 미세먼지랑 초미세먼지 등." 정성적 문구뿐 아니라 실제 수치도 함께 보여주는지 검증한다.
  it('오늘(미세먼지 데이터 있음)이면 기온/강수확률/미세먼지/초미세먼지 수치를 모두 보여준다', () => {
    const text = buildProactiveWeatherSuggestion(snapshot(), '2026-09-01', true);
    expect(text).toContain('기온 24℃');
    expect(text).toContain('강수확률 10%');
    expect(text).toContain("미세먼지 '좋음'");
    expect(text).toContain("초미세먼지 '좋음'");
  });

  it('오늘이 아닌 날짜(미세먼지 예보 없음)면 기온/강수확률만 보여주고 미세먼지는 정직하게 안내한다', () => {
    const text = buildProactiveWeatherSuggestion(
      snapshot({ pm10Grade: null, pm25Grade: null, airQualityAvailable: false }),
      '2026-09-05',
      false
    );
    expect(text).toContain('기온 24℃');
    expect(text).toContain('강수확률 10%');
    expect(text).not.toContain("미세먼지 '"); // 등급 수치는 없어야 한다
    expect(text).toContain('그 날이 가까워져야 정확히 알 수 있어요'); // 정직한 안내 문구는 있어야 한다
  });
});

describe('resolveWeatherSnapshot', () => {
  it('오늘 날짜면 nearestWeatherRow를 그대로 스냅샷으로 변환한다', async () => {
    const now = new Date('2026-08-31T15:00:00Z'); // KST 2026-09-01 00:00
    const row = {
      temperature: 25,
      precipitation_prob: 20,
      sky_status: '맑음',
      humidity: 55,
      pm10_grade: '보통',
      pm25_grade: '좋음',
    };
    const result = await resolveWeatherSnapshot('2026-09-01', 14, 37.5665, 126.978, row, now);
    expect(result).toEqual({
      available: true,
      temperature: 25,
      precipitationProb: 20,
      skyStatus: '맑음',
      humidity: 55,
      pm10Grade: '보통',
      pm25Grade: '좋음',
      airQualityAvailable: true,
    });
  });

  it('오늘인데 캐시 행이 없으면 available:false다', async () => {
    const now = new Date('2026-08-31T15:00:00Z');
    const result = await resolveWeatherSnapshot('2026-09-01', 14, 37.5665, 126.978, null, now);
    expect(result.available).toBe(false);
  });

  it('오늘이 아니면 KMA 라이브 예보를 조회하고 대기질은 항상 미제공이다', async () => {
    const now = new Date('2026-08-31T15:00:00Z'); // KST 2026-09-01
    vi.spyOn(kmaForecast, 'fetchLiveForecastForDate').mockResolvedValue({
      temperature: 22,
      precipitationProb: 60,
      skyStatus: '흐림',
      humidity: 70,
    });

    const result = await resolveWeatherSnapshot('2026-09-02', 15, 37.5665, 126.978, null, now);
    expect(result.available).toBe(true);
    expect(result.temperature).toBe(22);
    expect(result.airQualityAvailable).toBe(false);
    expect(result.pm10Grade).toBeNull();
    vi.restoreAllMocks();
  });

  it('KMA 라이브 조회가 실패하거나 예보 범위 밖이면 available:false로 우아하게 처리한다', async () => {
    const now = new Date('2026-08-31T15:00:00Z');
    vi.spyOn(kmaForecast, 'fetchLiveForecastForDate').mockRejectedValue(new Error('network error'));
    const result = await resolveWeatherSnapshot('2026-09-10', 15, 37.5665, 126.978, null, now);
    expect(result.available).toBe(false);
    vi.restoreAllMocks();
  });
});
