// [배치 자동화 및 로깅 체계 확정](2026-08-25) → [배치 스케줄링 조정](2026-08-26): 코드
// 분석 기반 분류 결과, "Monthly Batch"는 오직 open_spaces 테이블로만 적재하는(events와
// 전혀 무관한) API 전체로 구성된다 — 고정 장소/시설 데이터는 변동 빈도가 매우 낮아 매일은
// 물론 매주 갱신할 필요도 없다는 판단에 따라, 최초 구축한 Weekly(주간) 스케줄을 이번
// 지시로 Monthly(월 1회)로 전환한다(제5장 제4조 기존 구조 우선 — 대상 API 목록/분류 기준
// 자체는 변경 없음, 스케줄 주기만 조정).
//
// 실제 코드 확인 결과(각 파일의 super({ targetTable: ... }) 호출 대상을 직접 조사, targetTable
// 이 예외 없이 'open_spaces'인 어댑터 12개 + 레거시 스크립트 1개 = 13개):
//   CITY_PARK, CULTURAL_FACILITY_SUMMARY, LOCALDATA_AMUSEMENT, GG_EVENTS, GO_CAMPING,
//   NATIONAL_PARK_ECOTOUR, LOCALDATA_PLAYGROUND, PUBLIC_FACILITY_OPEN, SWIMMING_POOL,
//   KOR_TOUR_API_V4(×3: KorTour/KorWithTour/KorPetTour — 공유 베이스 TourApiV4AreaBasedAdapter),
//   CULTURE_FACILITY(cultural-spaces.mjs, 레거시 독립 스크립트).
//
// KorTour/GoCamping 계열 4종은 증분 수집 파라미터를 지원하지 않아(실측 확인,
// implementation/todo.md Task 2) 매회 전량 재수집(Full Ingest) 방식을 그대로 유지한다
// (코드 변경 없음, 스케줄 주기만 이동).
//
// 순차 실행(레이트리밋/DB 커넥션 과부하 방지) 후 docs/pipeline-log.md에 배치 리포트를 남긴다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, analyzeOpenSpaces } from './lib/supabase-admin.mjs';
import { dedupeOpenSpaces } from './lib/dedupe-open-spaces.mjs';
import { applyDetailedCategoryFallback } from './lib/detailed-category-fallback.mjs';
import { applyLegacySourceCategoryMapping } from './lib/legacy-source-category-mapping.mjs';
import { recordBatchRun } from './lib/batch-log.mjs';
import { applyCategoryRules } from './lib/category-rules.mjs';
import { CityParkAdapter } from './adapters/city-park-adapter.mjs';
import { CulturalFacilitySummaryAdapter } from './adapters/cultural-facility-summary-adapter.mjs';
import { AmusementParkAdapter } from './adapters/amusement-park-adapter.mjs';
import { GgEventsAdapter } from './adapters/gg-events-adapter.mjs';
import { GoCampingAdapter } from './adapters/go-camping-adapter.mjs';
import { NationalParkEcotourAdapter } from './adapters/national-park-ecotour-adapter.mjs';
import { PlaygroundAdapter } from './adapters/playground-adapter.mjs';
import { PublicFacilityOpenAdapter } from './adapters/public-facility-open-adapter.mjs';
import { SwimmingPoolAdapter } from './adapters/swimming-pool-adapter.mjs';
import { KorTourAdapter } from './adapters/kor-tour-adapter.mjs';
import { KorWithTourAdapter } from './adapters/kor-with-tour-adapter.mjs';
import { KorPetTourAdapter } from './adapters/kor-pet-tour-adapter.mjs';
import { run as runCulturalSpaces } from './cultural-spaces.mjs';

loadEnv();

const BATCH_NAME = 'Monthly Spaces Batch';

const STEPS = [
  { label: 'CITY_PARK', run: ({ dryRun }) => new CityParkAdapter().run({ dryRun }) },
  { label: 'CULTURE_FACILITY', run: ({ dryRun }) => runCulturalSpaces({ dryRun }) },
  { label: 'CULTURAL_FACILITY_SUMMARY', run: ({ dryRun }) => new CulturalFacilitySummaryAdapter().run({ dryRun }) },
  { label: 'LOCALDATA_AMUSEMENT', run: ({ dryRun }) => new AmusementParkAdapter().run({ dryRun }) },
  { label: 'GG_EVENTS', run: ({ dryRun }) => new GgEventsAdapter().run({ dryRun }) },
  { label: 'GO_CAMPING', run: ({ dryRun }) => new GoCampingAdapter().run({ dryRun }) },
  { label: 'NATIONAL_PARK_ECOTOUR', run: ({ dryRun }) => new NationalParkEcotourAdapter().run({ dryRun }) },
  { label: 'LOCALDATA_PLAYGROUND', run: ({ dryRun }) => new PlaygroundAdapter().run({ dryRun }) },
  { label: 'PUBLIC_FACILITY_OPEN', run: ({ dryRun }) => new PublicFacilityOpenAdapter().run({ dryRun }) },
  { label: 'SWIMMING_POOL', run: ({ dryRun }) => new SwimmingPoolAdapter().run({ dryRun }) },
  { label: 'KOR_TOUR', run: ({ dryRun }) => new KorTourAdapter().run({ dryRun }) },
  { label: 'KOR_WITH_TOUR', run: ({ dryRun }) => new KorWithTourAdapter().run({ dryRun }) },
  { label: 'KOR_PET_TOUR', run: ({ dryRun }) => new KorPetTourAdapter().run({ dryRun }) },
];

// [카테고리 정제 & 어드민 확장](2026-08-26): run-daily.mjs와 동일한 후처리 — category_min
// IS NULL 행에 최신 category_rules를 적용한다. open_spaces는 대부분 이 배치(월간)를 통해서만
// 적재되므로, 여기서도 반드시 실행해야 신규 수집분의 category_min이 채워진다.
async function runCategoryRulesApplication({ dryRun }) {
  if (dryRun) {
    return {
      sourceKey: 'CATEGORY_RULES_APPLICATION',
      source: null,
      targetTable: 'open_spaces',
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
    targetTable: 'open_spaces',
    rawCount: result.open_spaces.scanned + result.events.scanned,
    count: result.open_spaces.matched + result.events.matched,
    upserted: true,
    safeMergeCount: 0,
    errorCount: 0,
    excludeFromVerification: true,
    note: `category_min 신규 룰 매칭 후처리(신규 적재 아님) — open_spaces ${result.open_spaces.matched}/${result.open_spaces.scanned}건, events ${result.events.matched}/${result.events.scanned}건`,
  };
}

// [open_spaces 세부 중분류 매핑](2026-08-28): CATEGORY_RULES_APPLICATION 다음에 실행 —
// 상세: run-daily.mjs의 동일 이름 함수 주석 및
// docs/open-spaces-detailed-category-mapping-dryrun-report.md 3절 참고.
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

// [NULL 데이터 중분류 매핑 실제 적용](2026-08-28): CATEGORY_RULES_APPLICATION/
// DETAILED_CATEGORY_FALLBACK과 완전히 disjoint한 source_type 집합(LOCALDATA_PLAYGROUND/
// SWIMMING_POOL/LOCALDATA_AMUSEMENT/GG_EVENTS) — 상세: run-daily.mjs 동일 이름 함수
// 주석 및 docs/null-category-analysis.md 참고.
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

// [open_spaces 성능 최적화 및 타임아웃 재발 방지](2026-08-28): 이 배치는 playground
// (82,373건) 등 대량 open_spaces 적재를 수행한다 — 배치 종료 시점에 통계를 갱신해 다음
// 배치(다음 Daily/Monthly)의 open_spaces upsert가 stale 통계로 인한 statement timeout을
// 겪지 않도록 한다. dry-run에서는 실행하지 않는다(DB 상태 변경 없음 원칙).
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

// [open_spaces 중복 데이터 정제](2026-08-28): 이 배치는 서로 다른 여러 open_spaces 전용
// 어댑터(city_park/playground/tourapi 계열 등)를 한 번에 수집한다 - 각 어댑터가 서로
// 다른 external_id 스킴을 쓰는 이상 교차 출처 중복은 upsert의 ON CONFLICT로 막을 수 없어,
// 배치 종료 후처리로 정리한다(판정 기준: dedupe-open-spaces.mjs 상단 주석). 각 어댑터의
// "유연하게 적재한다" 원칙은 그대로 유지한다 - 이 후처리는 적재 이후에만 개입한다.
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
    note: `교차 출처 중복 정제 완료 - ${result.groupCount}개 그룹, survivor 병합 ${result.updated}건, 삭제 ${result.deleted}건${result.backupFile ? ` (백업: ${result.backupFile})` : ''}`,
  };
}

export async function runMonthlyBatch({ dryRun = false } = {}) {
  console.log(`\n▶▶▶ ${BATCH_NAME} 시작 (dry-run: ${dryRun}) — ${STEPS.length + 5}개 단계\n`);

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
  runMonthlyBatch({ dryRun }).then(({ failedCount }) => {
    process.exitCode = failedCount > 0 ? 1 : 0;
  });
}
