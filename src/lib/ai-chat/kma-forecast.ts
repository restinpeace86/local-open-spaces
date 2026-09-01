// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 5단계(Weather & Air): 인터뷰에서
// 선택한 날짜(오늘이 아닐 수 있음 — 내일/이번 주 토·일/직접선택)의 날씨를 보여주기 위한
// 기상청 단기예보 라이브 조회. `spot_weather_caches`(3시간 주기 배치)는 "지금 이 순간"
// 스냅샷 하나만 저장해서 미래 날짜 조회에는 쓸 수 없다 — getVilageFcst 한 번의 응답 자체가
// 이후 최대 며칠치 예보 슬롯(fcstDate/fcstTime 여러 개)을 함께 내려주므로, 그 원본 응답에서
// "목표 날짜와 정확히 일치하는" 슬롯만 직접 골라 쓴다(오늘 스냅샷을 재사용하며 추측하지
// 않음). `scripts/ingest/adapters/kma-weather-adapter.mjs`/`kma-base-time.mjs`와 같은
// 계산이지만, Next.js 서버 런타임에서 .mjs 인제스트 스크립트를 직접 import하지 않는 이
// 프로젝트의 기존 관례(kma-grid.ts 주석 참고)에 따라 필요한 부분만 TS로 다시 구현한다.
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { latLngToKmaGrid } from './kma-grid';

const BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const PUBLISH_HOURS_KST = [2, 5, 8, 11, 14, 17, 20, 23];
const PUBLISH_DELAY_MIN = 10;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const SKY_LABELS: Record<number, string> = { 1: '맑음', 3: '구름많음', 4: '흐림' };

// scripts/ingest/lib/kma-base-time.mjs의 getLatestVilageFcstBaseTime()와 동일한 계산 —
// "지금 요청 가능한 가장 최신 발표"를 구해야 그 응답에 목표 날짜(오늘~향후 며칠)의 슬롯이
// 담겨 온다.
function getLatestBaseTime(now: Date): { baseDate: string; baseTime: string } {
  const delayedKst = new Date(now.getTime() + KST_OFFSET_MS - PUBLISH_DELAY_MIN * 60 * 1000);
  const year = delayedKst.getUTCFullYear();
  const month = delayedKst.getUTCMonth();
  const day = delayedKst.getUTCDate();
  const hour = delayedKst.getUTCHours();

  let candidateHour: number | null = null;
  for (let i = PUBLISH_HOURS_KST.length - 1; i >= 0; i -= 1) {
    if (PUBLISH_HOURS_KST[i] <= hour) {
      candidateHour = PUBLISH_HOURS_KST[i];
      break;
    }
  }

  const baseDateUtc = candidateHour === null ? new Date(Date.UTC(year, month, day - 1)) : new Date(Date.UTC(year, month, day));
  if (candidateHour === null) candidateHour = 23;

  const baseDate = `${baseDateUtc.getUTCFullYear()}${String(baseDateUtc.getUTCMonth() + 1).padStart(2, '0')}${String(
    baseDateUtc.getUTCDate()
  ).padStart(2, '0')}`;
  const baseTime = `${String(candidateHour).padStart(2, '0')}00`;
  return { baseDate, baseTime };
}

type VilageFcstApiItem = { fcstDate: string; fcstTime: string; category: string; fcstValue: string };

async function fetchVilageFcstRaw(nx: number, ny: number, now: Date): Promise<VilageFcstApiItem[]> {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;
  if (!apiKey) throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');

  const { baseDate, baseTime } = getLatestBaseTime(now);
  const search = new URLSearchParams({
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
    numOfRows: '1000',
    pageNo: '1',
  });
  const url = `${BASE_URL}/getVilageFcst?serviceKey=${encodeURIComponent(apiKey)}&${search.toString()}`;

  const res = await fetchWithTimeout(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`KMA getVilageFcst 호출 실패(HTTP ${res.status}): ${text.slice(0, 300)}`);

  let json: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: unknown } } } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`KMA getVilageFcst 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  const header = json.response?.header;
  if (header?.resultCode !== '00') {
    throw new Error(`KMA getVilageFcst 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
  }

  const items = json.response?.body?.items?.item ?? [];
  return (Array.isArray(items) ? items : [items]) as VilageFcstApiItem[];
}

export type DayForecast = {
  temperature: number | null;
  precipitationProb: number | null;
  skyStatus: string | null;
  humidity: number | null;
};

// targetDate: 'YYYYMMDD', targetHour: 0~23(그 시간대와 가장 가까운 3시간 슬롯을 고른다).
// 응답에 해당 날짜 슬롯이 아예 없으면(예보 가능 범위 밖) null을 반환한다 — 추측하지 않음.
export function pickForecastForDate(items: VilageFcstApiItem[], targetDate: string, targetHour: number): DayForecast | null {
  const dayItems = items.filter((item) => item.fcstDate === targetDate);
  if (dayItems.length === 0) return null;

  const slots = [...new Set(dayItems.map((item) => item.fcstTime))];
  const nearestSlot = slots.reduce((closest, slot) => {
    const diff = Math.abs(Number(slot.slice(0, 2)) - targetHour);
    const closestDiff = Math.abs(Number(closest.slice(0, 2)) - targetHour);
    return diff < closestDiff ? slot : closest;
  }, slots[0]);

  const slotItems = dayItems.filter((item) => item.fcstTime === nearestSlot);
  const byCategory = Object.fromEntries(slotItems.map((item) => [item.category, item.fcstValue]));

  return {
    temperature: byCategory.TMP != null ? Number(byCategory.TMP) : null,
    precipitationProb: byCategory.POP != null ? Number(byCategory.POP) : null,
    skyStatus: byCategory.SKY != null ? (SKY_LABELS[Number(byCategory.SKY)] ?? byCategory.SKY) : null,
    humidity: byCategory.REH != null ? Number(byCategory.REH) : null,
  };
}

// targetDate: 'YYYY-MM-DD'(ISO), targetHour: 0~23.
export async function fetchLiveForecastForDate(
  lat: number,
  lng: number,
  targetDate: string,
  targetHour: number,
  now: Date = new Date()
): Promise<DayForecast | null> {
  const { nx, ny } = latLngToKmaGrid(lat, lng);
  const items = await fetchVilageFcstRaw(nx, ny, now);
  return pickForecastForDate(items, targetDate.replace(/-/g, ''), targetHour);
}
