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
import { createAdminClient, analyzeOpenSpaces } from './lib/supabase-admin.mjs';
import { dedupeOpenSpaces } from './lib/dedupe-open-spaces.mjs';
import { applyDetailedCategoryFallback } from './lib/detailed-category-fallback.mjs';
import { applyLegacySourceCategoryMapping } from './lib/legacy-source-category-mapping.mjs';
import { recordBatchRun } from './lib/batch-log.mjs';
import { GgCultureEventsAdapter } from './adapters/gg-culture-events-adapter.mjs';
import { SeoulYeyakAdapter } from './adapters/seoul-yeyak-adapter.mjs';
import { enrichGgCultureEventLocations } from './adapters/gg-culture-location-enrichment.mjs';
import { run as runSeoulCultureEvents } from './seoul-culture-events.mjs';
import { run as runTourApiFestival } from './tour-api-festival.mjs';
import { applyCategoryRules } from './lib/category-rules.mjs';
import { deactivateExpiredEvents } from './lib/deactivate-expired-events.mjs';

loadEnv();

const BATCH_NAME = 'Daily Events Batch';

// { label, run } — run()은 BaseCollectorAdapter.run()과 동일한 반환 형태를 따른다.
const STEPS = [
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
  console.log(`\n▶▶▶ ${BATCH_NAME} 시작 (dry-run: ${dryRun}) — ${STEPS.length + 7}개 단계\n`);

  const results = [];

  for (const step of STEPS) {
    console.log(`\n=== [${step.label}] ===`);
    try {
      const result = await step.run({ dryRun });
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
      const enrichmentResult = await runLocationEnrichment({ dryRun });
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  runDailyBatch({ dryRun }).then(({ failedCount }) => {
    process.exitCode = failedCount > 0 ? 1 : 0;
  });
}
