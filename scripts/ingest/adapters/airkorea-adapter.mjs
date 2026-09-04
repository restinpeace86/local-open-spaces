// [에어코리아(한국환경공단) 시도별 실시간 대기질 API 연동 어댑터](2026-09-01 사용자
// 지시): 공공데이터포털의 에어코리아 대기오염정보 서비스(`ArpltnInforInqireSvc`)의
// `/getCtprvnRltmMesureDnsty`(시도별 실시간 측정정보 조회)로 스팟별 미세먼지/초미세먼지
// 데이터를 수집해 `spot_weather_caches`를 채운다. `kma-weather-adapter.mjs`와 마찬가지로
// "이미 존재하는 스팟마다" 캐시를 채우는 데이터 모델이라 `BaseCollectorAdapter`를
// 상속하지 않고 함수 기반 모듈로 구현한다(제5장 제4조 기존 구조 우선 — 직전 KMA 어댑터와
// 동일한 판단).
//
// 인증키: `PUBLIC_DATA_API_KEY`를 그대로 재사용한다 — 이번 지시서가 제공한 "디코딩 키"를
// URL-디코딩해 보니 KMA 어댑터가 이미 재사용 중인 기존 `.env.local`의
// `PUBLIC_DATA_API_KEY`와 정확히 일치함을 확인했다(공공데이터포털은 여러 API에 동일한
// 포털 인증키를 공유하는 것이 일반적이라 이례적이지 않다). 새 환경변수를 만들지 않는다.
//
// [측정소 → 스팟 매핑이 KMA와 근본적으로 다른 이유] KMA는 위경도를 5km 격자로 직접
// 변환해 스팟과 1:1에 가깝게 매핑할 수 있지만, 에어코리아의 `/getCtprvnRltmMesureDnsty`는
// "시/도 전체"의 측정소 목록을 반환할 뿐 위경도를 주지 않는다(요구사항 2 파라미터 목록에
// 위경도 계열 파라미터가 없음 — 시/도 단위 조회가 이 엔드포인트의 설계 자체). 따라서 이
// 어댑터는 시/도 단위로만 대기질을 대표값화하고, 각 스팟의 `open_spaces.address` 첫
// 토큰(시/도)으로 해당 시/도의 대표값을 그대로 적용한다 — 측정소 단위보다 거칠지만, 이는
// 요구사항이 지정한 API 자체의 한계이지 이 어댑터의 구현 선택이 아니다.
import { pathToFileURL } from 'url';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { withRetry } from '../lib/retry.mjs';
import { settleGroupFetches } from '../lib/settle-group-fetches.mjs';
import { createAdminClient } from '../lib/supabase-admin.mjs';
import { getMissingEnvVars, formatMissingEnvVarsMessage } from '../lib/env-precheck.mjs';
import { extractSidoName, SIDO_NAMES } from '../lib/address-sido-lookup.mjs';
import { upsertWeatherCaches } from './kma-weather-adapter.mjs';
import { loadEnv } from '../../lib/load-env.mjs';

const BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc';
const SOURCE_KEY = 'AIRKOREA_AIR_QUALITY';
// 요구사항: "타임아웃 30초"는 fetchWithTimeout 기본값(30000ms)과 이미 동일하다.
// 요구사항: "실패 시 최대 2회 재시도(Exponential Backoff)" — kma-weather-adapter.mjs와
// 동일하게 retry.mjs의 기본 백오프(5초→10초)를 그대로 쓰고 retries만 2로 지정한다.
const RETRY_OPTIONS = { retries: 2 };

// 에어코리아 공식 등급 코드표(요구사항 명시: 1=좋음, 2=보통, 3=나쁨, 4=매우나쁨) —
// kma-weather-adapter.mjs의 SKY_LABELS와 동일한 관례로 숫자 코드를 한글 라벨로 번역한다.
const GRADE_LABELS = { 1: '좋음', 2: '보통', 3: '나쁨', 4: '매우나쁨' };

function buildUrl(path, params) {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;
  if (!apiKey) {
    throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  const search = new URLSearchParams({ returnType: 'JSON', ...params });
  return `${BASE_URL}${path}?serviceKey=${encodeURIComponent(apiKey)}&${search.toString()}`;
}

// [개선사항9 - 에어코리아 주간예보 연동](2026-09-04 todo.md)에서 신규 어댑터
// (airkorea-week-forecast-adapter.mjs)가 동일한 호출/에러 처리 로직을 그대로 재사용할
// 수 있도록 export한다(제5장 제4조 기존 구조 우선 — 거의 동일한 fetch+파싱 보일러
// 플레이트를 복붙하지 않음).
export async function fetchAirKoreaItems(path, params, label) {
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
        // 공공데이터포털 공통 특성(kma-weather-adapter.mjs와 동일) — 서비스키/파라미터
        // 오류 시 JSON이 아닌 XML 에러 페이지를 반환하는 경우가 있다.
        throw new Error(`${label} 응답이 JSON이 아닙니다(서비스키/파라미터 오류 가능성): ${text.slice(0, 300)}`);
      }

      const header = json.response?.header;
      if (header?.resultCode !== '00') {
        throw new Error(`${label} 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
      }

      // 에어코리아 JSON 응답은 KMA와 달리 items가 곧바로 배열이다(items.item으로 한 번 더
      // 감싸지 않음) — 실제 공공데이터포털 ArpltnInforInqireSvc 응답 스펙 기준.
      const items = json.response?.body?.items ?? [];
      return Array.isArray(items) ? items : [items];
    },
    { ...RETRY_OPTIONS, label }
  );
}

// 시도별 실시간 측정정보 조회(getCtprvnRltmMesureDnsty) — 요구사항 1/2.
export async function fetchCtprvnRltmMesureDnsty({ sidoName }) {
  return fetchAirKoreaItems(
    '/getCtprvnRltmMesureDnsty',
    { sidoName, numOfRows: 100, pageNo: 1, ver: '1.0' },
    `AirKorea getCtprvnRltmMesureDnsty(sidoName=${sidoName})`
  );
}

// pm10Value/pm25Value는 측정 불가 시 '-' 또는 빈 문자열로 내려온다(요구사항 2 "공백이나
// '-' 같은 예외 문자열 방어") — 숫자로 변환 불가능한 값은 전부 null로 취급한다.
function parseNumericOrNull(value) {
  if (value == null || value === '' || value === '-') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// pm10Grade/pm25Grade도 동일하게 방어한다 — 등급은 1~4 정수 코드만 유효하다(요구사항 2).
function parseGradeCodeOrNull(value) {
  const num = parseNumericOrNull(value);
  return num != null && GRADE_LABELS[num] ? num : null;
}

export function parseAirKoreaItem(item) {
  return {
    pm10: parseNumericOrNull(item.pm10Value),
    pm25: parseNumericOrNull(item.pm25Value),
    pm10GradeCode: parseGradeCodeOrNull(item.pm10Grade),
    pm25GradeCode: parseGradeCodeOrNull(item.pm25Grade),
  };
}

function average(numbers) {
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// 한 시/도 안의 여러 측정소 값을 스팟에 적용할 대표값 하나로 요약한다. 에어코리아
// `/getCtprvnRltmMesureDnsty`가 시/도 단위로만 데이터를 주는 API 설계 자체의 한계상,
// 측정소별 정밀 매칭이 불가능해(위경도 미제공) 시/도 평균을 대표값으로 쓴다 — 요구사항이
// 집계 방식을 명시하지 않아 내린 구현 판단이며, 등급은 원본 코드(1~4)를 평균한 뒤 반올림해
// 다시 라벨로 번역한다(kma-weather-adapter.mjs의 SKY 코드 번역과 동일한 관례).
export function aggregateSidoAirQuality(items) {
  if (!items || items.length === 0) return null;

  const parsed = items.map(parseAirKoreaItem);
  const pm10Values = parsed.map((p) => p.pm10).filter((v) => v != null);
  const pm25Values = parsed.map((p) => p.pm25).filter((v) => v != null);
  const pm10Grades = parsed.map((p) => p.pm10GradeCode).filter((v) => v != null);
  const pm25Grades = parsed.map((p) => p.pm25GradeCode).filter((v) => v != null);

  if (pm10Values.length === 0 && pm25Values.length === 0 && pm10Grades.length === 0 && pm25Grades.length === 0) {
    return null; // 응답은 왔지만 유효한 측정값이 하나도 없음(전 측정소 '-')
  }

  const pm10GradeAvg = pm10Grades.length > 0 ? Math.min(4, Math.max(1, Math.round(average(pm10Grades)))) : null;
  const pm25GradeAvg = pm25Grades.length > 0 ? Math.min(4, Math.max(1, Math.round(average(pm25Grades)))) : null;

  return {
    pm10: pm10Values.length > 0 ? Math.round(average(pm10Values) * 10) / 10 : null,
    pm25: pm25Values.length > 0 ? Math.round(average(pm25Values) * 10) / 10 : null,
    pm10_grade: pm10GradeAvg != null ? GRADE_LABELS[pm10GradeAvg] : null,
    pm25_grade: pm25GradeAvg != null ? GRADE_LABELS[pm25GradeAvg] : null,
  };
}

const PAGE_SIZE = 1000;

// kma-weather-adapter.mjs의 fetchAllExactSpots()와 동일한 커서 페이지네이션이지만, 여기서는
// 격자 매핑에 쓰는 좌표(location) 대신 시/도 판별에 쓰는 address가 필요해 select 컬럼만
// 다르다(제5장 제4조 기존 구조 우선 — 동일한 필터/정렬/페이지네이션 규약을 그대로 따름).
export async function fetchAllExactSpotsWithAddress(client) {
  const spots = [];
  let lastId = null;
  for (;;) {
    let query = client
      .from('open_spaces')
      .select('id, address')
      .eq('location_precision', 'EXACT')
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);
    for (const row of data ?? []) {
      if (row.address) spots.push({ id: row.id, address: row.address });
    }
    if (!data || data.length < PAGE_SIZE) break;
    lastId = data[data.length - 1].id;
  }
  return spots;
}

async function fetchLimitedExactSpotsWithAddress(client, limit) {
  const { data, error } = await client
    .from('open_spaces')
    .select('id, address')
    .eq('location_precision', 'EXACT')
    .limit(limit);
  if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);
  return (data ?? []).filter((row) => row.address).map((row) => ({ id: row.id, address: row.address }));
}

// run-daily.mjs/run-monthly.mjs/kma-weather-adapter.mjs와 동일한 관례 — 필수 환경변수
// 누락을 시작 시점에 한 번에 검사한다.
const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PUBLIC_DATA_API_KEY'];

// 17개 시/도를 순회 수집(요구사항 1)해 spot_weather_caches의 pm10/pm25/pm10_grade/
// pm25_grade를 채운다. `limit`을 넘기지 않으면 전국 EXACT 스팟 전체를 대상으로 한다
// (kma-weather-adapter.mjs와 동일한 기본값 정책).
export async function run({ dryRun = false, limit } = {}) {
  const startedAt = Date.now();

  const missingEnvVars = getMissingEnvVars(REQUIRED_ENV_VARS);
  if (missingEnvVars.length > 0) {
    const message = formatMissingEnvVarsMessage(missingEnvVars);
    console.error(`❌ [${SOURCE_KEY}] 배치 시작 불가: ${message}`);
    return { sourceKey: SOURCE_KEY, failed: true, count: 0, upserted: false, succeededSido: 0, failedSido: SIDO_NAMES.length, note: message };
  }

  const client = createAdminClient();
  console.log(
    `▶▶▶ [${SOURCE_KEY}] 배치 시작 (dry-run: ${dryRun}, 대상 시/도 ${SIDO_NAMES.length}개, 스팟 범위: ${
      limit ? `상위 ${limit}건` : '전국 EXACT 스팟 전체'
    })`
  );

  // 요구사항 4 "특정 시도 API 호출이 실패하더라도 전체 배치가 멈추지 않도록 개별
  // try-catch로 에러 격리" — kma-weather-adapter.mjs의 격자 격리와 동일하게
  // settleGroupFetches를 재사용한다(제5장 제4조).
  const sidoResults = await settleGroupFetches(
    SOURCE_KEY,
    SIDO_NAMES.map((sidoName) => ({ name: sidoName, run: () => fetchCtprvnRltmMesureDnsty({ sidoName }) }))
  );

  const sidoAirQuality = {};
  let succeededSido = 0;
  let failedSido = 0;
  for (const sidoName of SIDO_NAMES) {
    const items = sidoResults[sidoName];
    const aggregated = items ? aggregateSidoAirQuality(items) : null;
    if (aggregated) {
      sidoAirQuality[sidoName] = aggregated;
      succeededSido += 1;
    } else {
      failedSido += 1; // API 자체 실패 또는 응답은 왔으나 유효 측정값이 전혀 없음
    }
  }
  console.log(`  시/도별 대기질 수집 결과: 총 ${SIDO_NAMES.length}개(성공 ${succeededSido} / 실패 ${failedSido})`);

  const spots =
    typeof limit === 'number' ? await fetchLimitedExactSpotsWithAddress(client, limit) : await fetchAllExactSpotsWithAddress(client);
  console.log(`▶ [${SOURCE_KEY}] 대상 스팟 ${spots.length}건`);

  const updatedAt = new Date().toISOString();
  const rows = [];
  let unmatchedCount = 0;
  for (const spot of spots) {
    const sidoName = extractSidoName(spot.address);
    const aq = sidoName ? sidoAirQuality[sidoName] : null;
    if (!aq) {
      unmatchedCount += 1; // 시/도 판별 불가 주소이거나 해당 시/도 수집 자체가 실패함
      continue;
    }
    rows.push({ spot_id: spot.id, ...aq, updated_at: updatedAt });
  }
  console.log(`  대기질 매핑 결과: ${rows.length}/${spots.length}스팟 (미매칭 ${unmatchedCount}건 — 추측 매핑하지 않고 제외)`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    const durationMs = Date.now() - startedAt;
    console.log(`▶▶▶ [${SOURCE_KEY}] 배치 종료(dry-run) — 소요 시간 ${(durationMs / 1000).toFixed(1)}초`);
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false, succeededSido, failedSido, durationMs };
  }

  // spot_weather_caches upsert는 kma-weather-adapter.mjs가 이미 구축한 것을 그대로
  // 재사용한다(onConflict: spot_id, 배치 500건, 재시도 포함) — pm10/pm25 컬럼만 담긴
  // row라 KMA가 채운 temperature/precipitation_prob/sky_status/humidity는 건드리지
  // 않는다(Supabase upsert는 payload에 없는 컬럼을 덮어쓰지 않음).
  const { count } = await upsertWeatherCaches(client, rows);
  const durationMs = Date.now() - startedAt;
  console.log(`✅ [${SOURCE_KEY}] spot_weather_caches upsert 완료: ${count}건`);
  console.log(
    `▶▶▶ [${SOURCE_KEY}] 배치 종료 — 시/도 ${SIDO_NAMES.length}개(성공 ${succeededSido}/실패 ${failedSido}), 소요 시간 ${(
      durationMs / 1000
    ).toFixed(1)}초`
  );
  return { sourceKey: SOURCE_KEY, count, upserted: true, succeededSido, failedSido, durationMs };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined;

  run({ dryRun, ...(limit ? { limit } : {}) })
    .then(({ count, failedSido }) => {
      console.log(`▶▶▶ [${SOURCE_KEY}] 종료: ${count}건 처리`);
      process.exitCode = failedSido > 0 ? 1 : 0;
    })
    .catch((err) => {
      console.error(`❌ [${SOURCE_KEY}] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
