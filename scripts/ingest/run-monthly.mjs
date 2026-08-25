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
import { recordBatchRun } from './lib/batch-log.mjs';
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

export async function runMonthlyBatch({ dryRun = false } = {}) {
  console.log(`\n▶▶▶ ${BATCH_NAME} 시작 (dry-run: ${dryRun}) — ${STEPS.length}개 단계\n`);

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
