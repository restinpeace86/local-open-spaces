// [기상청 단기예보 조회서비스 연동 어댑터](2026-09-01 사용자 지시): 공공데이터포털
// 기상청 단기예보 조회서비스(VilageFcstInfoService_2.0)로 스팟별 날씨/대기질 캐시
// (spot_weather_caches)를 채운다. 이 어댑터는 다른 어댑터들(BaseCollectorAdapter 상속,
// "외부 카탈로그를 한 번 훑어 open_spaces/events에 신규 행을 upsert")과 데이터 모델이
// 근본적으로 다르다 — "이미 존재하는 스팟마다" 위경도 기준 날씨를 조회해 별도 1:1 캐시
// 테이블에 채우는 것이 목적이라 BaseCollectorAdapter를 상속하지 않고, tour-api-
// festival.mjs/seoul-culture-events.mjs와 같은 함수 기반 모듈로 구현한다(제5장 제4조
// 기존 구조 우선 — 안 맞는 틀에 억지로 끼워맞추지 않음).
//
// 인증키: PUBLIC_DATA_API_KEY를 그대로 재사용한다(사용자가 이번 지시서에서 제공한 키를
// URL-디코딩해 보니 기존 .env.local의 PUBLIC_DATA_API_KEY와 정확히 일치함을 확인했다 —
// 새 환경변수를 만들지 않는다). tour-api-festival.mjs가 이미 겪은 이중 인코딩 버그
// (디코딩된 키에 encodeURIComponent를 정확히 한 번만 적용해야 함)와 동일한 관례를 그대로
// 따른다.
//
// [격자 그룹핑 — 141,980건 규모에서 반드시 필요한 최적화] open_spaces가 141,980행
// 규모라(2026-08-30 실측), 스팟마다 개별 API 호출을 하면 같은 5km 격자 안의 스팟들이
// 완전히 동일한 날씨를 반복 조회하게 되어 API 호출이 폭발적으로 낭비된다 — 위경도를
// 먼저 (nx, ny) 격자로 변환해 같은 격자를 공유하는 스팟들을 하나로 묶고, 격자당 API를
// 정확히 1회만 호출한 뒤 그 결과를 소속된 모든 스팟에 그대로 복사한다.
import { pathToFileURL } from 'url';
import { latLngToKmaGrid } from '../lib/kma-grid.mjs';
import { getLatestUltraSrtNcstBaseTime, getLatestVilageFcstBaseTime } from '../lib/kma-base-time.mjs';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { withRetry } from '../lib/retry.mjs';
import { settleGroupFetches } from '../lib/settle-group-fetches.mjs';
import { createAdminClient } from '../lib/supabase-admin.mjs';
import { loadEnv } from '../../lib/load-env.mjs';

const BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const SOURCE_KEY = 'KMA_WEATHER';
// 요구사항: "타임아웃 30초"는 fetchWithTimeout 기본값(30000ms)과 이미 동일하다.
// 요구사항: "실패 시 최대 2회 재시도(Exponential Backoff)" — retry.mjs의 기본 백오프
// (5초→10초, 2026-08-30 사용자 지시로 이미 확정)는 그대로 쓰고 retries만 2로 지정한다.
const RETRY_OPTIONS = { retries: 2 };

// 기상청 SKY 코드(공식 코드표: 1=맑음, 3=구름많음, 4=흐림) — 문서화된 고정 코드표라
// 추측이 아니다.
const SKY_LABELS = { 1: '맑음', 3: '구름많음', 4: '흐림' };

function buildUrl(path, params) {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;
  if (!apiKey) {
    throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  const search = new URLSearchParams({ dataType: 'JSON', ...params });
  return `${BASE_URL}${path}?serviceKey=${encodeURIComponent(apiKey)}&${search.toString()}`;
}

async function fetchKmaItems(path, params, label) {
  return withRetry(
    async () => {
      const url = buildUrl(path, params);
      const res = await fetchWithTimeout(url);
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`${label} 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        // 기상청 API는 서비스키 오류/파라미터 오류 시 JSON이 아닌 XML 에러 페이지를
        // 반환하는 경우가 있다(공공데이터포털 공통 특성) — 원문 일부를 그대로 노출한다.
        throw new Error(`${label} 응답이 JSON이 아닙니다(서비스키/파라미터 오류 가능성): ${text.slice(0, 300)}`);
      }

      const header = json.response?.header;
      if (header?.resultCode !== '00') {
        throw new Error(`${label} 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
      }

      const items = json.response?.body?.items?.item ?? [];
      return Array.isArray(items) ? items : [items];
    },
    { ...RETRY_OPTIONS, label }
  );
}

// 단기예보 조회(getVilageFcst) — 3시간 단위 예보. 요구사항 1.
export async function fetchVilageFcst({ nx, ny, baseDate, baseTime }) {
  return fetchKmaItems(
    '/getVilageFcst',
    { base_date: baseDate, base_time: baseTime, nx, ny, numOfRows: 1000, pageNo: 1 },
    `KMA getVilageFcst(nx=${nx},ny=${ny},base=${baseDate}${baseTime})`
  );
}

// 초단기실황 조회(getUltraSrtNcst) — 요구사항 2, 선택적 적용. 현재 시점 실황 기온/습도만 쓴다.
export async function fetchUltraSrtNcst({ nx, ny, baseDate, baseTime }) {
  return fetchKmaItems(
    '/getUltraSrtNcst',
    { base_date: baseDate, base_time: baseTime, nx, ny, numOfRows: 100, pageNo: 1 },
    `KMA getUltraSrtNcst(nx=${nx},ny=${ny},base=${baseDate}${baseTime})`
  );
}

// getVilageFcst는 여러 발표 시각(fcstDate/fcstTime)에 걸친 예보를 한꺼번에 내려준다 —
// spot_weather_caches는 스팟당 "현재" 스냅샷 한 건만 저장하므로, 가장 이른(=지금과 가장
// 가까운) 예보 시각 하나만 골라 그 시각의 TMP/POP/SKY/REH를 추출한다.
export function parseVilageFcstItems(items) {
  if (!items || items.length === 0) return null;

  const slots = items.map((item) => `${item.fcstDate}${item.fcstTime}`);
  const nearestSlot = slots.reduce((min, slot) => (slot < min ? slot : min), slots[0]);
  const nearestItems = items.filter((item) => `${item.fcstDate}${item.fcstTime}` === nearestSlot);
  const byCategory = Object.fromEntries(nearestItems.map((item) => [item.category, item.fcstValue]));

  return {
    temperature: byCategory.TMP != null ? Number(byCategory.TMP) : null,
    precipitation_prob: byCategory.POP != null ? Number(byCategory.POP) : null,
    sky_status: byCategory.SKY != null ? (SKY_LABELS[Number(byCategory.SKY)] ?? byCategory.SKY) : null,
    humidity: byCategory.REH != null ? Number(byCategory.REH) : null,
  };
}

// getUltraSrtNcst는 카테고리 T1H(기온)/REH(습도)만 쓴다(요구사항 2 "현재 시점의 실황
// 기온 및 습도 확인용" — 강수확률/하늘상태는 이 엔드포인트에 아예 없는 개념이라 그대로 둠).
export function parseUltraSrtNcstItems(items) {
  if (!items || items.length === 0) return null;
  const byCategory = Object.fromEntries(items.map((item) => [item.category, item.obsrValue]));
  return {
    temperature: byCategory.T1H != null ? Number(byCategory.T1H) : null,
    humidity: byCategory.REH != null ? Number(byCategory.REH) : null,
  };
}

// 위경도 기준으로 격자를 구해, 같은 격자를 공유하는 스팟들을 하나로 묶는다.
export function groupSpotsByGrid(spots) {
  const groups = new Map();
  for (const spot of spots) {
    const { nx, ny } = latLngToKmaGrid(spot.lat, spot.lng);
    const key = `${nx},${ny}`;
    if (!groups.has(key)) groups.set(key, { nx, ny, spotIds: [] });
    groups.get(key).spotIds.push(spot.id);
  }
  return [...groups.values()];
}

// 격자 하나에 대한 날씨를 조회한다. useUltraSrtNcst가 true면 실황으로 temperature/
// humidity를 보강 시도하되, 실패해도(요구사항 "개별 try-catch 에러 격리") 예보값을
// 그대로 쓰고 전체를 실패시키지 않는다 — 이 보강은 요구사항이 "선택적"이라고 명시한
// 부가 기능이라 필수 경로의 안정성보다 우선할 수 없다.
async function fetchGridWeather({ nx, ny }, { useUltraSrtNcst = false } = {}) {
  const { baseDate, baseTime } = getLatestVilageFcstBaseTime();
  const fcstItems = await fetchVilageFcst({ nx, ny, baseDate, baseTime });
  const fcst = parseVilageFcstItems(fcstItems);
  if (!fcst) {
    throw new Error(`getVilageFcst 응답에 유효한 예보 항목이 없습니다(nx=${nx}, ny=${ny}, base=${baseDate}${baseTime})`);
  }

  let { temperature, humidity } = fcst;

  if (useUltraSrtNcst) {
    try {
      const ncstBase = getLatestUltraSrtNcstBaseTime();
      const ncstItems = await fetchUltraSrtNcst({ nx, ny, baseDate: ncstBase.baseDate, baseTime: ncstBase.baseTime });
      const ncst = parseUltraSrtNcstItems(ncstItems);
      if (ncst?.temperature != null) temperature = ncst.temperature;
      if (ncst?.humidity != null) humidity = ncst.humidity;
    } catch (err) {
      console.warn(`⚠️ [${SOURCE_KEY}] getUltraSrtNcst 실황 보강 실패(nx=${nx},ny=${ny}) — 예보값 유지: ${err.message}`);
    }
  }

  return {
    temperature,
    precipitation_prob: fcst.precipitation_prob,
    sky_status: fcst.sky_status,
    humidity,
  };
}

// spots: [{ id, lat, lng }]. 격자별로 API를 정확히 1회씩만 호출하고, 격자 하나가
// 실패해도(요구사항 "개별 try-catch 에러 격리") 나머지 격자는 계속 진행한다
// (settleGroupFetches 재사용 — 2026-09-01에 이미 구축한 동일한 격리 패턴).
export async function collectWeatherForSpots(spots, { useUltraSrtNcst = false } = {}) {
  const groups = groupSpotsByGrid(spots);
  if (groups.length === 0) return [];

  const results = await settleGroupFetches(
    SOURCE_KEY,
    groups.map((group) => ({
      name: `${group.nx},${group.ny}`,
      run: () => fetchGridWeather(group, { useUltraSrtNcst }),
    }))
  );

  const updatedAt = new Date().toISOString();
  const rows = [];
  for (const group of groups) {
    const weather = results[`${group.nx},${group.ny}`];
    if (!weather) continue; // 이 격자만 실패 — settleGroupFetches가 이미 경고 로그를 남겼다.
    for (const spotId of group.spotIds) {
      rows.push({ spot_id: spotId, ...weather, updated_at: updatedAt });
    }
  }
  return rows;
}

const UPSERT_BATCH_SIZE = 500;

// spot_weather_caches는 "캐시"라 open_spaces/events의 upsertRowsSafeMerge(NULL 병합,
// 기존 값 보존)와 다르게 최신값으로 완전히 덮어써야 한다 — 어제 기온이 오늘도 남아있으면
// 안 되므로 일반 upsert(전체 컬럼 덮어쓰기)를 쓴다.
export async function upsertWeatherCaches(client, rows) {
  if (rows.length === 0) return { count: 0 };

  let count = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await withRetry(
      async () => {
        const { error } = await client.from('spot_weather_caches').upsert(batch, { onConflict: 'spot_id' });
        if (error) throw new Error(`spot_weather_caches upsert 실패: ${error.message}`);
      },
      { label: 'spot_weather_caches upsert' }
    );
    count += batch.length;
  }
  return { count };
}

// 안전장치: open_spaces 141,980건 전체를 한 회차에 처리하지 않는다(격자 그룹핑으로
// API 호출 수는 크게 줄어들지만, DB 조회/쓰기 및 배치 실행 시간까지 무제한으로 늘리지
// 않기 위한 보수적 기본값 — 실제 운영 규모는 사용자 확인 후 조정 가능).
const DEFAULT_SPOT_LIMIT = 2000;

function extractCoords(location) {
  const coords = location?.coordinates;
  return coords ? { lng: coords[0], lat: coords[1] } : null;
}

// open_spaces에서 좌표가 정확한(EXACT) 스팟을 대상으로 날씨를 수집해 upsert한다.
// [배치 수집 안정성 고도화](2026-08-30~09-01) 관례를 그대로 따른다: dryRun이면 DB를
// 건드리지 않고 결과 미리보기만 출력한다.
export async function run({ dryRun = false, limit = DEFAULT_SPOT_LIMIT, useUltraSrtNcst = false } = {}) {
  const client = createAdminClient();

  const { data, error } = await client
    .from('open_spaces')
    .select('id, location')
    .eq('location_precision', 'EXACT')
    .limit(limit);
  if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);

  const spots = (data ?? [])
    .map((row) => {
      const coords = extractCoords(row.location);
      return coords ? { id: row.id, ...coords } : null;
    })
    .filter(Boolean);

  console.log(`▶ [${SOURCE_KEY}] 대상 스팟 ${spots.length}건`);
  const groups = groupSpotsByGrid(spots);
  console.log(`  고유 격자 셀 ${groups.length}개로 그룹핑(중복 API 호출 회피)`);

  const rows = await collectWeatherForSpots(spots, { useUltraSrtNcst });
  console.log(`  날씨 데이터 확보: ${rows.length}/${spots.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false };
  }

  const { count } = await upsertWeatherCaches(client, rows);
  console.log(`✅ [${SOURCE_KEY}] spot_weather_caches upsert 완료: ${count}건`);
  return { sourceKey: SOURCE_KEY, count, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const useUltraSrtNcst = process.argv.includes('--with-ultra-srt-ncst');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined;

  run({ dryRun, useUltraSrtNcst, ...(limit ? { limit } : {}) })
    .then(({ count }) => {
      console.log(`▶▶▶ [${SOURCE_KEY}] 종료: ${count}건 처리`);
    })
    .catch((err) => {
      console.error(`❌ [${SOURCE_KEY}] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
