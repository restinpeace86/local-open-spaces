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
import { createAdminClient } from './lib/supabase-admin.mjs';
import { recordBatchRun } from './lib/batch-log.mjs';
import { GgCultureEventsAdapter } from './adapters/gg-culture-events-adapter.mjs';
import { SeoulYeyakAdapter } from './adapters/seoul-yeyak-adapter.mjs';
import { enrichGgCultureEventLocations } from './adapters/gg-culture-location-enrichment.mjs';
import { run as runSeoulCultureEvents } from './seoul-culture-events.mjs';
import { run as runTourApiFestival } from './tour-api-festival.mjs';

loadEnv();

const BATCH_NAME = 'Daily Events Batch';

// { label, run } — run()은 BaseCollectorAdapter.run()과 동일한 반환 형태를 따른다.
const STEPS = [
  { label: 'GG_CULTURE_EVENTS', run: ({ dryRun }) => new GgCultureEventsAdapter().run({ dryRun }) },
  { label: 'SEOUL_CULTURE_EVENTS', run: ({ dryRun }) => runSeoulCultureEvents({ dryRun }) },
  { label: 'TOUR_API_FESTIVAL', run: ({ dryRun }) => runTourApiFestival({ dryRun }) },
  { label: 'SEOUL_YEYAK', run: ({ dryRun }) => new SeoulYeyakAdapter().run({ dryRun }) },
];

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

export async function runDailyBatch({ dryRun = false } = {}) {
  console.log(`\n▶▶▶ ${BATCH_NAME} 시작 (dry-run: ${dryRun}) — ${STEPS.length + 1}개 단계\n`);

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
