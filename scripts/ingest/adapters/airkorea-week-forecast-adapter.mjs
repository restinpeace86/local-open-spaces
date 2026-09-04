// [에어코리아 초미세먼지 '주간예보' 연동 어댑터](2026-09-04 todo.md 개선사항9): "현재
// 구현되어 있는 에어코리아 대기질 단기(실시간) 예보 연동 로직(airkorea-adapter.mjs)을
// 참고해서 주간예보 엔드포인트(`/getMinuDustWeekFrcstDspth`)를 하나 더 추가"를
// 구현한다. 같은 API 그룹(`ArpltnInforInqireSvc`)이라 인증키/호출/에러 처리 로직을
// airkorea-adapter.mjs에서 그대로 재사용한다(제5장 제4조 기존 구조 우선).
//
// [실측 확인 — 지시서 필드명과 실제 응답이 다름] 지시서 원문은 "informData, informCode,
// informOverall, 권역별 등급"을 언급했지만, PUBLIC_DATA_API_KEY로 이 엔드포인트를 실제
// 호출해 확인한 결과 그런 필드는 존재하지 않는다. 실제 응답 구조:
//   presnatnDt              : 예보 발표일자
//   gwthcnd                 : 종합 안내문(총평, 발표 1건에 하나 — 4일 전체를 아우름)
//   frcstOneDt / frcstOneCn : 1일째 대상일자 + "지역명 : 등급, ..., 신뢰도 : 등급" 텍스트
//   frcstTwoDt / frcstTwoCn, frcstThreeDt / frcstThreeCn, frcstFourDt / frcstFourCn : 2~4일째
// 또한 `InformCode=PM10`/`PM25`를 명시적으로 넘겨도 응답이 완전히 동일했다 — 이
// 엔드포인트는 PM10/PM2.5를 구분하지 않고 "미세먼지" 통합 주간 전망 1건만 발표한다
// (추측이 아니라 실제 호출로 확인, project/decision-log.md의 기존 관례대로 실측값을
// 따르고 이 차이를 여기 명시한다).
import { pathToFileURL } from 'url';
import { withRetry } from '../lib/retry.mjs';
import { createAdminClient } from '../lib/supabase-admin.mjs';
import { getMissingEnvVars, formatMissingEnvVarsMessage } from '../lib/env-precheck.mjs';
import { fetchAirKoreaItems } from './airkorea-adapter.mjs';
import { loadEnv } from '../../lib/load-env.mjs';

const SOURCE_KEY = 'AIRKOREA_WEEK_FORECAST';
const RETRY_OPTIONS = { retries: 2 };
const UPSERT_BATCH_SIZE = 500; // kma-weather-adapter.mjs와 동일한 관례

// 주간예보통보 조회(getMinuDustWeekFrcstDspth) — 요구사항 1. searchDate를 생략하면
// 오늘 날짜로 가장 최근 발표문을 조회한다(공공데이터포털 관례).
export async function fetchWeekForecast({ searchDate } = {}) {
  const date = searchDate ?? new Date().toISOString().slice(0, 10);
  return fetchAirKoreaItems(
    '/getMinuDustWeekFrcstDspth',
    { searchDate: date, numOfRows: 10, pageNo: 1 },
    `AirKorea getMinuDustWeekFrcstDspth(searchDate=${date})`
  );
}

// "지역명 : 등급" 쌍이 쉼표로 나열된 텍스트를 파싱한다. 마지막 "신뢰도 : 등급"은
// 지역이 아니므로 별도로 분리한다 — 실측 응답에 항상 이 순서로 등장했다.
export function parseRegionGradeText(text) {
  if (!text) return { regionGrades: [], reliability: null };

  const regionGrades = [];
  let reliability = null;
  for (const pair of text.split(',')) {
    const [rawKey, rawValue] = pair.split(':').map((s) => s?.trim());
    if (!rawKey || !rawValue) continue;
    if (rawKey === '신뢰도') {
      reliability = rawValue;
    } else {
      regionGrades.push({ region: rawKey, grade: rawValue });
    }
  }
  return { regionGrades, reliability };
}

const DAY_FIELDS = [
  { dateKey: 'frcstOneDt', textKey: 'frcstOneCn' },
  { dateKey: 'frcstTwoDt', textKey: 'frcstTwoCn' },
  { dateKey: 'frcstThreeDt', textKey: 'frcstThreeCn' },
  { dateKey: 'frcstFourDt', textKey: 'frcstFourCn' },
];

// 발표문 1건(item)을 "대상일 1건 = 행 1건"으로 정규화한다(요구사항 2 — DB에 안전하게
// 적재). 대상일 날짜 자체가 없는 필드는 만들지 않는다(추측 금지 — 값이 없으면 행도
// 없다).
export function buildForecastRows(item) {
  const announcedDate = item.presnatnDt ?? null;
  const summary = item.gwthcnd ?? null;

  const rows = [];
  for (const { dateKey, textKey } of DAY_FIELDS) {
    const forecastDate = item[dateKey];
    if (!forecastDate) continue;
    const text = item[textKey] ?? null;
    const { regionGrades, reliability } = parseRegionGradeText(text);
    rows.push({
      announced_date: announcedDate,
      forecast_date: forecastDate,
      summary,
      region_grades: regionGrades,
      reliability,
      raw_forecast_text: text,
    });
  }
  return rows;
}

// kma-weather-adapter.mjs의 upsertWeatherCaches와 동일한 배치 upsert 관례(제5장
// 제4조) — (announced_date, forecast_date) 조합이 unique 제약이라 같은 발표를 다시
// 적재해도 안전하게 갱신된다.
export async function upsertWeekForecasts(client, rows) {
  if (rows.length === 0) return { count: 0 };

  let count = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await withRetry(
      async () => {
        const { error } = await client
          .from('air_quality_week_forecasts')
          .upsert(batch, { onConflict: 'announced_date,forecast_date' });
        if (error) throw new Error(`air_quality_week_forecasts upsert 실패: ${error.message}`);
      },
      { ...RETRY_OPTIONS, label: 'air_quality_week_forecasts upsert' }
    );
    count += batch.length;
  }
  return { count };
}

const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PUBLIC_DATA_API_KEY'];

export async function run({ dryRun = false, searchDate } = {}) {
  const startedAt = Date.now();

  const missingEnvVars = getMissingEnvVars(REQUIRED_ENV_VARS);
  if (missingEnvVars.length > 0) {
    const message = formatMissingEnvVarsMessage(missingEnvVars);
    console.error(`❌ [${SOURCE_KEY}] 배치 시작 불가: ${message}`);
    return { sourceKey: SOURCE_KEY, failed: true, count: 0, upserted: false, note: message };
  }

  console.log(`▶▶▶ [${SOURCE_KEY}] 배치 시작 (dry-run: ${dryRun})`);

  let items;
  try {
    items = await fetchWeekForecast({ searchDate });
  } catch (err) {
    // [요구사항 3 코드 컨벤션] airkorea-adapter.mjs의 개별 시/도 격리(settleGroupFetches)와
    // 달리 이 엔드포인트는 시/도별 호출이 아니라 발표문 1건을 한 번만 조회하는 구조라,
    // 격리할 그룹 자체가 없다 — API 실패는 배치 전체 실패로 정직하게 보고한다(제5장
    // 제11조: 실패해도 서비스가 죽지 않도록 예외를 잡아 구조화된 결과로 반환).
    console.error(`❌ [${SOURCE_KEY}] API 호출 실패: ${err.message}`);
    return { sourceKey: SOURCE_KEY, failed: true, count: 0, upserted: false, note: err.message };
  }

  const rows = items.flatMap(buildForecastRows);
  console.log(`▶ [${SOURCE_KEY}] 발표 ${items.length}건 → 예보 대상일 ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows, null, 2));
    const durationMs = Date.now() - startedAt;
    console.log(`▶▶▶ [${SOURCE_KEY}] 배치 종료(dry-run) — 소요 시간 ${(durationMs / 1000).toFixed(1)}초`);
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false, durationMs };
  }

  const client = createAdminClient();
  const { count } = await upsertWeekForecasts(client, rows);
  const durationMs = Date.now() - startedAt;
  console.log(`✅ [${SOURCE_KEY}] air_quality_week_forecasts upsert 완료: ${count}건`);
  console.log(`▶▶▶ [${SOURCE_KEY}] 배치 종료 — 소요 시간 ${(durationMs / 1000).toFixed(1)}초`);
  return { sourceKey: SOURCE_KEY, count, upserted: true, durationMs };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const searchDateArg = process.argv.find((arg) => arg.startsWith('--search-date='));
  const searchDate = searchDateArg ? searchDateArg.slice('--search-date='.length) : undefined;

  run({ dryRun, searchDate })
    .then(({ count, failed }) => {
      console.log(`▶▶▶ [${SOURCE_KEY}] 종료: ${count}건 처리`);
      process.exitCode = failed ? 1 : 0;
    })
    .catch((err) => {
      console.error(`❌ [${SOURCE_KEY}] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
