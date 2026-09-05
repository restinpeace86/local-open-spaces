// [배치 자동화 및 로깅 체계 확정](2026-08-25): 코드 분석 기반 분류(제5장 제5조 데이터 중심
// 구현 — 임의 추측이 아니라 각 어댑터의 실제 targetTable을 grep으로 직접 확인) 결과, "Daily
// Batch"는 (1) events 테이블로만 적재하는 API 전체 + (2) events/open_spaces 양쪽으로 분리
// 적재하는 복합 API(SeoulYeyakAdapter, targetTable: 'multi')로 구성된다 — 복합 API는 사용자
// 지시대로 "행사/접수 상태 갱신을 위해 반드시 Daily 기준으로 포함"한다.
//
// 실제 코드 확인 결과(각 파일의 super({ targetTable: ... }) 또는 upsertRowsSafeMerge() 호출
// 대상을 직접 조사):
//   - GG_CULTURE_EVENTS (gg-culture-events-adapter.mjs)           → targetTable: 'events'
//   - SEOUL_CULTURE_EVENTS (seoul-culture-events.mjs)             → upsertRowsSafeMerge(..., 'events', ...)
//   - TOUR_API_FESTIVAL (tour-api-festival.mjs)                   → upsertRowsSafeMerge(..., 'events', ...)
//   - SEOUL_YEYAK (seoul-yeyak-adapter.mjs)                       → targetTable: 'multi' (복합 API)
// + enrich-gg-culture-event-locations(후처리, gg-culture-events가 CITY_APPROX/UNKNOWN으로
//   남긴 좌표를 EXACT로 승격) — 신규 수집이 아니라 같은 날 수집한 events 행을 보강하는
//   단계라 gg-culture-events 바로 다음에 실행해야 의미가 있다.
//
// 순차 실행(레이트리밋/DB 커넥션 과부하 방지 — [전체 파이프라인 일괄 가동] 작업에서 동시
// 실행 시 문제를 겪은 바 있어 그 교훈을 그대로 따른다) 후 docs/pipeline-log.md에 배치
// 리포트를 남긴다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { getMissingEnvVars, formatMissingEnvVarsMessage } from './lib/env-precheck.mjs';
import { createAdminClient, analyzeOpenSpaces, refreshSigunguOptionsCache } from './lib/supabase-admin.mjs';
import { dedupeOpenSpaces } from './lib/dedupe-open-spaces.mjs';
import { applyDetailedCategoryFallback } from './lib/detailed-category-fallback.mjs';
import { applyLegacySourceCategoryMapping } from './lib/legacy-source-category-mapping.mjs';
import { recordBatchRun } from './lib/batch-log.mjs';
import { withStepTimeout } from './lib/with-step-timeout.mjs';
import { GgCultureEventsAdapter } from './adapters/gg-culture-events-adapter.mjs';
import { SeoulYeyakAdapter } from './adapters/seoul-yeyak-adapter.mjs';
import { enrichGgCultureEventLocations } from './adapters/gg-culture-location-enrichment.mjs';
import { run as runSeoulCultureEvents } from './seoul-culture-events.mjs';
import { run as runTourApiFestival } from './tour-api-festival.mjs';
import { applyCategoryRules } from './lib/category-rules.mjs';
import { deactivateExpiredEvents } from './lib/deactivate-expired-events.mjs';

loadEnv();

const BATCH_NAME = 'Daily Events Batch';

// [지오코딩 안전장치 — 전체 스텝 하드 타임아웃](2026-09-05 사용자 지시) 참고 —
// with-step-timeout.mjs. 서킷 브레이커로 지오코딩 자체는 이제 훨씬 빠르게 포기하지만,
// 네트워크 크롤링(GG_CULTURE_LOCATION_ENRICHMENT)을 포함한 스텝은 원인을 알 수 없는
// 다른 hang에도 대비해 별도의 상한을 둔다. 평소 실행 시간(수 초~1분대, docs/pipeline-
// log.md 실측)에 비해 넉넉한 10분을 상한으로 잡는다.
const STEP_TIMEOUT_MS = 10 * 60 * 1000;

// [핵심 events 수집 파이프라인 장애 점검](2026-08-30 사용자 지시): 아래 4개 소스 어댑터의
// 실제 소스 코드(각 파일의 `throw new Error('... 환경변수가 설정되지 않았습니다.')` 가드)를
// 조사해 확정한, 없으면 반드시 실패하는 필수 환경변수 목록이다. GEMINI_API_KEY(AI 분류)/
// VWORLD_API_KEY(지오코딩)는 없어도 각 어댑터가 경고만 남기고 계속 진행하도록 이미
// 설계돼 있어(우아한 성능 저하) 여기 포함하지 않는다.
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GG_DATA_API_KEY',
  'SEOUL_OPEN_DATA_KEY',
  'PUBLIC_DATA_API_KEY',
];

// { label, run } — run()은 BaseCollectorAdapter.run()과 동일한 반환 형태를 따른다.
// [배치 수집 안정성 고도화](2026-08-30 사용자 지시): 관리자가 특정 소스만 골라 수동
// 재수집할 수 있어야 해서(요구사항 "관리자 수동 재수집 트리거") export한다 — CLI의
// `--only=<label>`과 src/app/api/admin/ingest/rerun/route.ts가 이 배열을 그대로
// 재사용해 동일한 실행 경로(중복 없음, 제5장 제4조)를 탄다.
export const STEPS = [
  { label: 'GG_CULTURE_EVENTS', run: ({ dryRun }) => new GgCultureEventsAdapter().run({ dryRun }) },
  { label: 'SEOUL_CULTURE_EVENTS', run: ({ dryRun }) => runSeoulCultureEvents({ dryRun }) },
  { label: 'TOUR_API_FESTIVAL', run: ({ dryRun }) => runTourApiFestival({ dryRun }) },
  { label: 'SEOUL_YEYAK', run: ({ dryRun }) => new SeoulYeyakAdapter().run({ dryRun }) },
];

// [카테고리 정제 & 어드민 확장](2026-08-26): 이번 배치에서 새로 적재된(또는 아직 미분류인)
// category_min IS NULL 행에 DB의 최신 category_rules 키워드 규칙을 적용해 RULE로 채운다.
// GG_CULTURE_LOCATION_ENRICHMENT와 달리 특정 단계의 성공 여부에 의존하지 않는다(전체 events
// 테이블의 미분류 행을 대상으로 하는 독립적인 후처리라 앞선 개별 단계 실패와 무관하게 항상
// 실행할 가치가 있음).
async function runCategoryRulesApplication({ dryRun }) {
  if (dryRun) {
    return {
      sourceKey: 'CATEGORY_RULES_APPLICATION',
      source: null,
      targetTable: 'events',
      rawCount: 0,
      count: 0,
      upserted: false,
      safeMergeCount: 0,
      errorCount: 0,
      excludeFromVerification: true,
      note: 'dry-run: 실제 재분류는 실행하지 않음',
    };
  }

  const client = createAdminClient();
  const result = await applyCategoryRules(client);
  return {
    sourceKey: 'CATEGORY_RULES_APPLICATION',
    source: null,
    targetTable: 'events',
    rawCount: result.open_spaces.scanned + result.events.scanned,
    count: result.open_spaces.matched + result.events.matched,
    upserted: true,
    safeMergeCount: 0,
    errorCount: 0,
    excludeFromVerification: true,
    note: `category_min 신규 룰 매칭 후처리(신규 적재 아님) — open_spaces ${result.open_spaces.matched}/${result.open_spaces.scanned}건, events ${result.events.matched}/${result.events.scanned}건`,
  };
}

// [open_spaces 세부 중분류 매핑](2026-08-28): CATEGORY_RULES_APPLICATION이 구체적인 키워드로
// 먼저 분류를 시도한 뒤에도 남은 NULL 중, 이 taxonomy의 데이터 도메인에 해당하는
// 8개 source_type(docs/open-spaces-detailed-category-mapping-dryrun-report.md 1절)에
// 한해서만 '기타'로 채운다 — 반드시 CATEGORY_RULES_APPLICATION 다음에 실행해야 키워드로
// 분류될 수 있었던 행이 먼저 '기타'로 채워지는 일이 없다.
async function runDetailedCategoryFallback({ dryRun }) {
  if (dryRun) {
    return {
      sourceKey: 'DETAILED_CATEGORY_FALLBACK',
      source: null,
      targetTable: 'open_spaces',
      rawCount: 0,
      count: 0,
      upserted: false,
      safeMergeCount: 0,
      errorCount: 0,
      excludeFromVerification: true,
      note: 'dry-run: 실제 UPDATE는 실행하지 않음',
    };
  }

  const client = createAdminClient();
  const result = await applyDetailedCategoryFallback(client);
  return {
    sourceKey: 'DETAILED_CATEGORY_FALLBACK',
    source: null,
    targetTable: 'open_spaces',
    rawCount: result.scanned,
    count: result.updated,
    upserted: true,
    safeMergeCount: 0,
    errorCount: 0,
    excludeFromVerification: true,
    note: `세부 중분류 미분류 잔여를 '기타'로 안전 적재(8개 대상 source_type 한정) — ${result.updated}/${result.scanned}건`,
  };
}

// [NULL 데이터 중분류 매핑 실제 적용](2026-08-28): docs/null-category-analysis.md에서
// "적용 가능"으로 판정한 4개 source_type(LOCALDATA_PLAYGROUND/SWIMMING_POOL/
// LOCALDATA_AMUSEMENT/GG_EVENTS)을 매 배치마다 자동으로 채운다 — DETAILED_CATEGORY_
// FALLBACK과 완전히 disjoint한 source_type 집합이라 실행 순서는 서로 영향을 주지 않는다.
async function runLegacySourceCategoryMapping({ dryRun }) {
  if (dryRun) {
    return {
      sourceKey: 'LEGACY_SOURCE_CATEGORY_MAPPING',
      source: null,
      targetTable: 'open_spaces',
      rawCount: 0,
      count: 0,
      upserted: false,
      safeMergeCount: 0,
      errorCount: 0,
      excludeFromVerification: true,
      note: 'dry-run: 실제 UPDATE는 실행하지 않음',
    };
  }

  const client = createAdminClient();
  const result = await applyLegacySourceCategoryMapping(client);
  return {
    sourceKey: 'LEGACY_SOURCE_CATEGORY_MAPPING',
    source: null,
    targetTable: 'open_spaces',
    rawCount: result.updated,
    count: result.updated,
    upserted: true,
    safeMergeCount: 0,
    errorCount: 0,
    excludeFromVerification: true,
    note: `docs/null-category-analysis.md 적용 범위(어린이놀이시설/수영장/키즈카페/바닥분수·물놀이시설) 매핑 — ${result.updated}건, 내역: ${JSON.stringify(result.breakdown)}`,
  };
}

// [0순위 우선 요청] 만료 데이터 자동 비활성화(2026-08-26): "end_date < CURRENT_DATE -
// INTERVAL '2 DAY'"인 events 행을 is_active=false로 전환한다. 신규 수집분("적재 시")과
// 기존 적재분("이미 적재된 데이터") 모두 이 매일 배치 한 번으로 함께 커버된다 — 오늘 새로
// 들어온 행이든 예전부터 있던 행이든, end_date 조건만 보고 판단하기 때문에 소스/수집
// 시점과 무관하게 동일하게 적용된다. dry-run 시에는 실행하지 않는다(사용자 지시: 시뮬레이션
// 보고 전에는 실제 DB 반영 금지 — docs/category-mapping-keywords-draft.md 4절 참고).
async function runDeactivateExpiredEvents({ dryRun }) {
  if (dryRun) {
    return {
      sourceKey: 'DEACTIVATE_EXPIRED_EVENTS',
      source: null,
      targetTable: 'events',
      rawCount: 0,
      count: 0,
      upserted: false,
      safeMergeCount: 0,
      errorCount: 0,
      excludeFromVerification: true,
      note: 'dry-run: 실제 비활성화는 실행하지 않음',
    };
  }

  const client = createAdminClient();
  const { cutoffDate, deactivatedCount } = await deactivateExpiredEvents(client);
  return {
    sourceKey: 'DEACTIVATE_EXPIRED_EVENTS',
    source: null,
    targetTable: 'events',
    rawCount: deactivatedCount,
    count: deactivatedCount,
    upserted: deactivatedCount > 0,
    safeMergeCount: 0,
    errorCount: 0,
    excludeFromVerification: true,
    note: `end_date < ${cutoffDate} 이면서 is_active=true였던 행 ${deactivatedCount}건을 false로 전환(신규 적재 아닌 만료 정리 후처리)`,
  };
}

async function runLocationEnrichment({ dryRun }) {
  const client = createAdminClient();
  const adapter = new GgCultureEventsAdapter();
  const result = await enrichGgCultureEventLocations({ client, adapter, dryRun });
  return {
    sourceKey: 'GG_CULTURE_LOCATION_ENRICHMENT',
    source: 'gg_public',
    targetTable: 'events',
    rawCount: result.total,
    count: result.updated,
    upserted: !dryRun,
    safeMergeCount: 0,
    errorCount: result.noUrlRecovered + result.noVenueField + result.geocodeFailed,
    excludeFromVerification: true,
    note: `좌표 정밀도 보강 후처리(신규 적재 아님, gg-culture-events 종속) — EXACT 승격 ${result.updated}/${result.total}건, URL복원실패 ${result.noUrlRecovered}/장소필드없음 ${result.noVenueField}/지오코딩실패 ${result.geocodeFailed}`,
  };
}

// [open_spaces 성능 최적화 및 타임아웃 재발 방지](2026-08-28): SEOUL_YEYAK가 이 배치에서
// open_spaces에도 기록하므로(targetTable: 'multi'), 배치 종료 시점에 통계를 갱신해 다음
// 배치(내일 Daily 또는 다음 Monthly)의 open_spaces upsert가 stale 통계로 인한 statement
// timeout을 겪지 않도록 한다. dry-run에서는 실행하지 않는다(DB 상태 변경 없음 원칙).
async function runAnalyzeOpenSpaces({ dryRun }) {
  if (dryRun) {
    return {
      sourceKey: 'ANALYZE_OPEN_SPACES',
      source: null,
      targetTable: 'open_spaces',
      rawCount: 0,
      count: 0,
      upserted: false,
      safeMergeCount: 0,
      errorCount: 0,
      excludeFromVerification: true,
      note: 'dry-run: 실제 ANALYZE는 실행하지 않음',
    };
  }

  const client = createAdminClient();
  await analyzeOpenSpaces(client);
  return {
    sourceKey: 'ANALYZE_OPEN_SPACES',
    source: null,
    targetTable: 'open_spaces',
    rawCount: 0,
    count: 0,
    upserted: false,
    safeMergeCount: 0,
    errorCount: 0,
    excludeFromVerification: true,
    note: 'open_spaces 플래너 통계 갱신 완료(신규 적재 아닌 유지보수 후처리) — statement timeout 재발 방지',
  };
}

// [챗봇 개선](2026-09-04 사용자 지시) 3: get_sigungu_options()가 매 요청마다 open_spaces+
// events 전체를 다시 집계해 17.68초가 걸려 PostgREST 8초 타임아웃에 항상 걸리던 문제를
// sigungu_options_cache 머티리얼라이즈드 뷰로 해결했다(scripts/migrations/2026-09-04-
// sigungu-options-cache.sql). 이 데이터는 새 지역이 이 배치로 처음 수집될 때만
// 달라지므로, 오늘 배치가 끝난 직후 한 번 갱신해 다음 조회부터 최신 지역까지 반영되게
// 한다.
async function runRefreshSigunguOptionsCache({ dryRun }) {
  if (dryRun) {
    return {
      sourceKey: 'REFRESH_SIGUNGU_OPTIONS_CACHE',
      source: null,
      targetTable: 'sigungu_options_cache',
      rawCount: 0,
      count: 0,
      upserted: false,
      safeMergeCount: 0,
      errorCount: 0,
      excludeFromVerification: true,
      note: 'dry-run: 실제 REFRESH는 실행하지 않음',
    };
  }

  const client = createAdminClient();
  await refreshSigunguOptionsCache(client);
  return {
    sourceKey: 'REFRESH_SIGUNGU_OPTIONS_CACHE',
    source: null,
    targetTable: 'sigungu_options_cache',
    rawCount: 0,
    count: 0,
    upserted: false,
    safeMergeCount: 0,
    errorCount: 0,
    excludeFromVerification: true,
    note: '시/군/구 목록 캐시 갱신 완료(오늘 배치로 새로 추가된 지역이 있다면 반영됨)',
  };
}

// [open_spaces 중복 데이터 정제](2026-08-28): 서로 다른 두 개 이상의 어댑터(source_type)가
// 각자 원본 API에서 같은 실제 장소를 카탈로그에 등재해두면(예: "선화랑"이 KOR_TOUR_API_V4와
// seoul_public_culture 양쪽에 존재), 각 어댑터는 서로 다른 external_id를 매기므로
// upsert의 ON CONFLICT(external_id)로는 이 교차 출처 중복을 원천 차단할 수 없다 — 각 어댑터의
// "유연하게 적재한다" 원칙(불완전한 데이터도 버리지 않음)은 그대로 둔 채, 적재 이후 시점에
// 배치 종료 후처리로 교차 출처 중복만 판정해 정리한다(판정 기준: dedupe-open-spaces.mjs 상단
// 주석 참고 — 단일 출처 내부 반복은 안전하게 판별할 근거가 없어 제외). 매 배치 시작 시점에
// 전날 새로 들어온 중복도 함께 잡히므로 앞으로도 계속 쌓이지 않는다.
async function runDedupeOpenSpaces({ dryRun }) {
  if (dryRun) {
    return {
      sourceKey: 'DEDUPE_OPEN_SPACES',
      source: null,
      targetTable: 'open_spaces',
      rawCount: 0,
      count: 0,
      upserted: false,
      safeMergeCount: 0,
      errorCount: 0,
      excludeFromVerification: true,
      note: 'dry-run: 실제 UPDATE/DELETE는 실행하지 않음',
    };
  }

  const result = await dedupeOpenSpaces({ dryRun: false });
  return {
    sourceKey: 'DEDUPE_OPEN_SPACES',
    source: null,
    targetTable: 'open_spaces',
    rawCount: 0,
    count: result.deleted,
    upserted: false,
    safeMergeCount: result.updated,
    errorCount: 0,
    excludeFromVerification: true,
    note: `교차 출처 중복 정제 완료 — ${result.groupCount}개 그룹, survivor 병합 ${result.updated}건, 삭제 ${result.deleted}건${result.backupFile ? ` (백업: ${result.backupFile})` : ''}`,
  };
}

export async function runDailyBatch({ dryRun = false } = {}) {
  console.log(`\n▶▶▶ ${BATCH_NAME} 시작 (dry-run: ${dryRun}) — ${STEPS.length + 8}개 단계\n`);

  // [핵심 events 수집 파이프라인 장애 점검](2026-08-30 사용자 지시): 필수 환경변수가 하나라도
  // 없으면 이후 11개 단계가 각자 다른 형태로 실패해(외부 API 키 누락 예외/Supabase 클라이언트
  // 생성 실패/원본 서버의 "인증키 무효" 응답 등) 카스케이드 에러를 하나하나 해석해야만
  // 원인을 알 수 있다 — 실제로 2026-08-29 01:59 UTC 실행에서 이 카스케이드 실패가
  // 재현됐다(docs/pipeline-log.md, 로컬 .env.local 기준 dry-run은 11/11 성공해 코드 문제가
  // 아님을 확인). 시작 시점에 한 번에 검사해 즉시 명확한 원인과 함께 중단한다.
  const missingEnvVars = getMissingEnvVars(REQUIRED_ENV_VARS);
  if (missingEnvVars.length > 0) {
    const message = formatMissingEnvVarsMessage(missingEnvVars);
    console.error(`❌ ${BATCH_NAME} 시작 불가: ${message}`);
    const precheckResult = { failed: true, sourceKey: 'ENV_PRECHECK', source: null, note: message };
    if (!dryRun) {
      recordBatchRun({ batchName: BATCH_NAME, results: [precheckResult] });
    }
    return { results: [precheckResult], failedCount: 1 };
  }

  const results = [];

  for (const step of STEPS) {
    console.log(`\n=== [${step.label}] ===`);
    try {
      const result = await withStepTimeout(() => step.run({ dryRun }), { label: step.label, timeoutMs: STEP_TIMEOUT_MS });
      results.push(result);
    } catch (err) {
      console.error(`❌ [${step.label}] 실패: ${err.message}`);
      results.push({ failed: true, sourceKey: step.label, source: step.label, note: err.message });
    }
  }

  // GG_CULTURE_EVENTS가 성공했을 때만 후처리를 의미 있게 돌릴 수 있다(오늘 새로 CITY_APPROX/
  // UNKNOWN으로 저장된 행이 있어야 승격 대상이 생김) — 실패했으면 후처리도 건너뛰고 그 사실만
  // 표에 남긴다.
  const cultureEventsResult = results.find((r) => r.sourceKey === 'GG_CULTURE_EVENTS');
  if (cultureEventsResult && !cultureEventsResult.failed) {
    console.log('\n=== [GG_CULTURE_LOCATION_ENRICHMENT] ===');
    try {
      const enrichmentResult = await withStepTimeout(() => runLocationEnrichment({ dryRun }), {
        label: 'GG_CULTURE_LOCATION_ENRICHMENT',
        timeoutMs: STEP_TIMEOUT_MS,
      });
      results.push(enrichmentResult);
    } catch (err) {
      console.error(`❌ [GG_CULTURE_LOCATION_ENRICHMENT] 실패: ${err.message}`);
      results.push({ failed: true, sourceKey: 'GG_CULTURE_LOCATION_ENRICHMENT', source: 'gg_public', note: err.message });
    }
  } else {
    console.log('\n⏭️  [GG_CULTURE_LOCATION_ENRICHMENT] GG_CULTURE_EVENTS 실패로 건너뜀');
    results.push({
      failed: true,
      sourceKey: 'GG_CULTURE_LOCATION_ENRICHMENT',
      source: 'gg_public',
      note: 'GG_CULTURE_EVENTS 실패로 건너뜀',
    });
  }

  console.log('\n=== [CATEGORY_RULES_APPLICATION] ===');
  try {
    results.push(await runCategoryRulesApplication({ dryRun }));
  } catch (err) {
    console.error(`❌ [CATEGORY_RULES_APPLICATION] 실패: ${err.message}`);
    results.push({ failed: true, sourceKey: 'CATEGORY_RULES_APPLICATION', source: null, note: err.message });
  }

  console.log('\n=== [DETAILED_CATEGORY_FALLBACK] ===');
  try {
    results.push(await runDetailedCategoryFallback({ dryRun }));
  } catch (err) {
    console.error(`❌ [DETAILED_CATEGORY_FALLBACK] 실패: ${err.message}`);
    results.push({ failed: true, sourceKey: 'DETAILED_CATEGORY_FALLBACK', source: null, note: err.message });
  }

  console.log('\n=== [LEGACY_SOURCE_CATEGORY_MAPPING] ===');
  try {
    results.push(await runLegacySourceCategoryMapping({ dryRun }));
  } catch (err) {
    console.error(`❌ [LEGACY_SOURCE_CATEGORY_MAPPING] 실패: ${err.message}`);
    results.push({ failed: true, sourceKey: 'LEGACY_SOURCE_CATEGORY_MAPPING', source: null, note: err.message });
  }

  console.log('\n=== [DEACTIVATE_EXPIRED_EVENTS] ===');
  try {
    results.push(await runDeactivateExpiredEvents({ dryRun }));
  } catch (err) {
    console.error(`❌ [DEACTIVATE_EXPIRED_EVENTS] 실패: ${err.message}`);
    results.push({ failed: true, sourceKey: 'DEACTIVATE_EXPIRED_EVENTS', source: null, note: err.message });
  }

  console.log('\n=== [DEDUPE_OPEN_SPACES] ===');
  try {
    results.push(await runDedupeOpenSpaces({ dryRun }));
  } catch (err) {
    console.error(`❌ [DEDUPE_OPEN_SPACES] 실패: ${err.message}`);
    results.push({ failed: true, sourceKey: 'DEDUPE_OPEN_SPACES', source: null, note: err.message });
  }

  console.log('\n=== [ANALYZE_OPEN_SPACES] ===');
  try {
    results.push(await runAnalyzeOpenSpaces({ dryRun }));
  } catch (err) {
    console.error(`❌ [ANALYZE_OPEN_SPACES] 실패: ${err.message}`);
    results.push({ failed: true, sourceKey: 'ANALYZE_OPEN_SPACES', source: null, note: err.message });
  }

  console.log('\n=== [REFRESH_SIGUNGU_OPTIONS_CACHE] ===');
  try {
    results.push(await runRefreshSigunguOptionsCache({ dryRun }));
  } catch (err) {
    console.error(`❌ [REFRESH_SIGUNGU_OPTIONS_CACHE] 실패: ${err.message}`);
    results.push({ failed: true, sourceKey: 'REFRESH_SIGUNGU_OPTIONS_CACHE', source: null, note: err.message });
  }

  if (!dryRun) {
    recordBatchRun({ batchName: BATCH_NAME, results });
  }

  const failedCount = results.filter((r) => r.failed).length;
  console.log(
    `\n▶▶▶ ${BATCH_NAME} 종료: ${results.length - failedCount}/${results.length}개 단계 성공${
      failedCount > 0 ? ` (${failedCount}개 실패 — docs/pipeline-log.md 확인)` : ''
    }\n`
  );

  return { results, failedCount };
}

// [배치 수집 안정성 고도화](2026-08-30 사용자 지시): "관리자 화면에서 실패한 특정 API
// 소스만 지정해 개별 수동 재수집" — 전체 배치(후처리 단계 포함)를 다시 돌리지 않고
// STEPS 중 해당 소스 하나만 즉시 재실행한다. CLI(`--only=`)와 관리자 API 라우트가
// 이 함수를 공유한다.
export async function runSingleDailySource(sourceKey, { dryRun = false } = {}) {
  const step = STEPS.find((s) => s.label === sourceKey);
  if (!step) {
    throw new Error(`알 수 없는 Daily 배치 소스입니다: ${sourceKey} (가능한 값: ${STEPS.map((s) => s.label).join(', ')})`);
  }
  console.log(`▶▶▶ [Daily 개별 재수집] ${sourceKey} (dry-run: ${dryRun})`);
  const result = await step.run({ dryRun });
  if (!dryRun) {
    recordBatchRun({ batchName: `${BATCH_NAME} (개별 재수집: ${sourceKey})`, results: [result] });
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));

  if (onlyArg) {
    const sourceKey = onlyArg.slice('--only='.length);
    runSingleDailySource(sourceKey, { dryRun })
      .then((result) => {
        process.exitCode = result.failed ? 1 : 0;
      })
      .catch((err) => {
        console.error(`❌ 개별 재수집 실패: ${err.message}`);
        process.exitCode = 1;
      });
  } else {
    runDailyBatch({ dryRun }).then(({ failedCount }) => {
      process.exitCode = failedCount > 0 ? 1 : 0;
    });
  }
}
