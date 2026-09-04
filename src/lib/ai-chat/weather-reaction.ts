// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 5단계(Weather & Air): "AI가
// 해당 일자/시간의 기상 정보(강수확률, 미세먼지/초미세먼지)를 분석해 먼저 넌지시 보여준
// 뒤, 야외/실내/둘 다 선택 유도"를 구현한다.
//
// [LLM 미사용 — 요구사항 2-① 원칙] 이 리액션 문구는 반드시 백엔드 템플릿 리터럴 조합으로
// 만든다. LLM은 8단계 인터뷰 전체에서 단 한 번도 호출하지 않고, 최종 요약(summary.ts)
// 단계에서만 쓴다.
//
// [오늘 vs 미래 날짜 — 데이터 정밀도가 근본적으로 다름]
// - 오늘: `spot_weather_caches`(3시간 주기 KMA+에어코리아 배치)의 "지금" 스냅샷을 그대로
//   쓴다 — 기온/강수확률/하늘상태/습도 + 미세먼지/초미세먼지 등급까지 전부 실측값이다.
// - 오늘이 아닌 날짜(내일/이번 주 토·일/직접선택): 에어코리아 `/getCtprvnRltmMesureDnsty`는
//   "실시간" 전용이라 미래 미세먼지 예보 자체가 존재하지 않는다(추측 금지) — 기온/강수확률/
//   하늘상태만 KMA 라이브 예보(`kma-forecast.ts`)로 보여주고, 미세먼지는 "그 날이 되어야
//   알 수 있다"고 정직하게 안내한다.
import { isToday } from './date-resolver';
import { DayForecast, fetchLiveForecastForDate } from './kma-forecast';

export type OutdoorRecommendation = 'OUTDOOR' | 'INDOOR' | 'EITHER';

export type WeatherSnapshot = {
  available: boolean;
  temperature: number | null;
  precipitationProb: number | null;
  skyStatus: string | null;
  humidity: number | null;
  pm10Grade: string | null; // 오늘이 아니면 항상 null(예보 데이터 없음)
  pm25Grade: string | null;
  airQualityAvailable: boolean; // 오늘 날짜에만 true일 수 있음
};

const RAIN_THRESHOLD_INDOOR = 50; // 강수확률(%) 이 이상이면 실내를 권장
const RAIN_THRESHOLD_OUTDOOR = 30; // 이 미만이면 야외를 권장(그 사이는 EITHER)
const BAD_AIR_GRADES = ['나쁨', '매우나쁨'];

export function recommendMode(snapshot: WeatherSnapshot): OutdoorRecommendation {
  if (!snapshot.available) return 'EITHER';

  const rainy = snapshot.precipitationProb != null && snapshot.precipitationProb >= RAIN_THRESHOLD_INDOOR;
  const badAir = snapshot.airQualityAvailable && (BAD_AIR_GRADES.includes(snapshot.pm10Grade ?? '') || BAD_AIR_GRADES.includes(snapshot.pm25Grade ?? ''));
  if (rainy || badAir) return 'INDOOR';

  const clear = snapshot.precipitationProb != null && snapshot.precipitationProb < RAIN_THRESHOLD_OUTDOOR;
  const goodAirOrUnknown = !snapshot.airQualityAvailable || (!BAD_AIR_GRADES.includes(snapshot.pm10Grade ?? '') && snapshot.pm10Grade != null);
  if (clear && goodAirOrUnknown) return 'OUTDOOR';

  return 'EITHER';
}

function describeWhenLabel(isoDate: string, today: boolean): string {
  return today ? '오늘' : `선택하신 날짜(${isoDate})`;
}

// 요구사항 원문 예시("이동 거리까지 접수 완료했습니다! 잠시만요, 선택하신 날짜의 날씨를
// 확인해 보니...")의 톤을 그대로 템플릿화한다 — 이전 답변(이동 거리)의 맥락을 받아치는
// 문장으로 시작해 단순 설문조사처럼 보이지 않게 한다(요구사항 2-①).
export function buildWeatherReactionText(snapshot: WeatherSnapshot, isoDate: string, today: boolean): string {
  const whenLabel = describeWhenLabel(isoDate, today);

  if (!snapshot.available) {
    return `이동 거리까지 접수 완료했습니다! 잠시만요, ${whenLabel} 날씨를 확인해 보려 했는데 아쉽게도 아직 근처 예보 데이터를 확보하지 못했어요. 야외/실내 중 어디로 가고 싶으신지 편하게 골라주세요!`;
  }

  const parts: string[] = [`이동 거리까지 접수 완료했습니다! 잠시만요, ${whenLabel} 날씨를 확인해 보니...`];

  const weatherBits: string[] = [];
  if (snapshot.precipitationProb != null) weatherBits.push(`강수확률 ${snapshot.precipitationProb}%`);
  if (snapshot.skyStatus) weatherBits.push(snapshot.skyStatus);
  if (snapshot.temperature != null) weatherBits.push(`기온 ${snapshot.temperature}℃`);
  if (weatherBits.length > 0) parts.push(`🌤️ ${weatherBits.join(', ')}이네요!`);

  if (snapshot.airQualityAvailable) {
    const airBits: string[] = [];
    if (snapshot.pm10Grade) airBits.push(`미세먼지 '${snapshot.pm10Grade}'`);
    if (snapshot.pm25Grade) airBits.push(`초미세먼지 '${snapshot.pm25Grade}'`);
    if (airBits.length > 0) parts.push(`${airBits.join(', ')}이에요.`);
  } else if (!today) {
    parts.push('미세먼지는 아쉽게도 그 날이 가까워져야 정확히 알 수 있어요.');
  }

  // [개선사항5 - 봇 추천 단어 필터링](2026-09-04 todo.md): "'공원'이라는 단어와 픽스된
  // 제안은 전면 배제, 이벤트픽의 6대 대분류 성격에 맞춰 '야외 이벤트'/'야외 나들이'
  // 위주로 자연스럽게 제안" — 특정 시설(공원/놀이터)을 콕 집어 말하지 않고 성격으로만
  // 제안한다.
  const mode = recommendMode(snapshot);
  if (mode === 'OUTDOOR') {
    parts.push('날씨가 너무 맑아서 오늘 같은 날은 탁 트인 야외 나들이나 야외 이벤트로 가는 게 훨씬 좋을 것 같은데, 어떠세요?');
  } else if (mode === 'INDOOR') {
    parts.push('날씨가 변덕스러울 수 있어서 실내 공간(박물관, 키즈카페 등)이 더 마음 편할 것 같아요. 어떻게 할까요?');
  } else {
    parts.push('야외도 실내도 무난할 것 같은데, 어느 쪽으로 가고 싶으세요?');
  }

  return parts.join(' ');
}

// [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시) Step 1: 챗봇 실행
// 시(또는 날짜를 바꿀 때) 날씨를 먼저 체크해 "구체적인 제안(Default Option)"을 던지는
// 문구. 기존 buildWeatherReactionText()는 이동거리 질문 다음(옛 5단계)에 나오는 리액션
// 톤이라 그대로 재사용하기 어려워 새 함수로 분리한다 — 톤은 요구사항 원문 예시("오늘
// 날씨가 화창하고 참 좋네요! ☀️...")를 그대로 템플릿화했다.
// [챗봇 개선](2026-09-04 사용자 지시) 2: "구체적인 수치 알려줘 — 온도랑 강수확률, 미세먼지랑
// 초미세먼지 등 기상데이터 기반으로." 기존에는 "화창하다"/"구름이 많다"처럼 정성적으로만
// 말해 snapshot에 이미 있는 실제 수치(기온/강수확률/미세먼지 등급)를 전혀 보여주지
// 않았다 — buildWeatherReactionText가 이미 만들어 둔 수치 표기 방식을 그대로 가져와
// 이 함수에도 반영한다. 미세먼지/초미세먼지는 "오늘"에만 있는 값이라(위 파일 상단 설명
// 참고) 미래 날짜는 값을 지어내지 않고 정직하게 "그 날이 가까워져야 알 수 있다"고
// 안내한다.
export function buildProactiveWeatherSuggestion(snapshot: WeatherSnapshot, isoDate: string, today: boolean): string {
  const whenLabel = today ? '오늘' : `선택하신 날짜(${isoDate})`;

  if (!snapshot.available) {
    return `${whenLabel} 날씨 예보를 아직 확인하지 못했어요. 야외/실내 중 어디로 가고 싶으신지 편하게 골라주세요!`;
  }

  const numberBits: string[] = [];
  if (snapshot.temperature != null) numberBits.push(`기온 ${snapshot.temperature}℃`);
  if (snapshot.precipitationProb != null) numberBits.push(`강수확률 ${snapshot.precipitationProb}%`);
  if (snapshot.airQualityAvailable) {
    if (snapshot.pm10Grade) numberBits.push(`미세먼지 '${snapshot.pm10Grade}'`);
    if (snapshot.pm25Grade) numberBits.push(`초미세먼지 '${snapshot.pm25Grade}'`);
  }
  const numberSentence = numberBits.length > 0 ? ` (${numberBits.join(', ')})` : '';
  const airCaveat = !today && !snapshot.airQualityAvailable ? ' 미세먼지는 아쉽게도 그 날이 가까워져야 정확히 알 수 있어요.' : '';

  // [개선사항5 - 봇 추천 단어 필터링](2026-09-04 todo.md): "'공원' 단어 배제, '야외
  // 이벤트'/'야외 나들이' 위주로 자연스럽게 제안" — 위 buildWeatherReactionText와
  // 동일한 원칙 적용.
  const mode = recommendMode(snapshot);
  if (mode === 'OUTDOOR') {
    return `${whenLabel} 날씨가 화창하고 참 좋네요!${numberSentence} ☀️ 파란 하늘 아래 아이랑 즐기기 좋은 야외 나들이가 좋아보여요.${airCaveat} 야외 이벤트 위주로 알아볼까요?`;
  }
  if (mode === 'INDOOR') {
    return `${whenLabel} 날씨를 보니 구름이 많거나 비가 오네요.${numberSentence} 🌧️ 아이와 함께 포근한 실내 위주가 좋아보여요.${airCaveat} 실내 위주로 알아볼까요?`;
  }
  return `${whenLabel} 날씨는 야외도 실내도 무난할 것 같아요!${numberSentence}${airCaveat} 어떤 스타일로 알아봐드릴까요?`;
}

type NearestWeatherRow = {
  temperature: number | null;
  precipitation_prob: number | null;
  sky_status: string | null;
  humidity: number | null;
  pm10_grade: string | null;
  pm25_grade: string | null;
};

// nearestWeatherRow: '오늘'일 때 get_nearest_spot_weather RPC 1건(없으면 null)을 그대로 넘긴다.
// 호출부(API 라우트)가 Supabase 조회를 맡고, 이 함수는 순수 조합/판단만 한다(테스트 용이성).
export async function resolveWeatherSnapshot(
  isoDate: string,
  hour: number,
  lat: number,
  lng: number,
  nearestWeatherRow: NearestWeatherRow | null,
  now: Date = new Date()
): Promise<WeatherSnapshot> {
  if (isToday(isoDate, now)) {
    if (!nearestWeatherRow) {
      return {
        available: false,
        temperature: null,
        precipitationProb: null,
        skyStatus: null,
        humidity: null,
        pm10Grade: null,
        pm25Grade: null,
        airQualityAvailable: false,
      };
    }
    return {
      available: true,
      temperature: nearestWeatherRow.temperature,
      precipitationProb: nearestWeatherRow.precipitation_prob,
      skyStatus: nearestWeatherRow.sky_status,
      humidity: nearestWeatherRow.humidity,
      pm10Grade: nearestWeatherRow.pm10_grade,
      pm25Grade: nearestWeatherRow.pm25_grade,
      airQualityAvailable: nearestWeatherRow.pm10_grade != null || nearestWeatherRow.pm25_grade != null,
    };
  }

  let forecast: DayForecast | null;
  try {
    forecast = await fetchLiveForecastForDate(lat, lng, isoDate, hour, now);
  } catch {
    forecast = null; // 외부 API 실패 시 서비스 중단 없이 "정보 없음"으로 우아하게 처리(제5장 제11조)
  }

  if (!forecast) {
    return {
      available: false,
      temperature: null,
      precipitationProb: null,
      skyStatus: null,
      humidity: null,
      pm10Grade: null,
      pm25Grade: null,
      airQualityAvailable: false,
    };
  }

  return {
    available: true,
    temperature: forecast.temperature,
    precipitationProb: forecast.precipitationProb,
    skyStatus: forecast.skyStatus,
    humidity: forecast.humidity,
    pm10Grade: null,
    pm25Grade: null,
    airQualityAvailable: false,
  };
}
