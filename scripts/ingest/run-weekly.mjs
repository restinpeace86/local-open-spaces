// [배치 자동화 및 로깅 체계 확정](2026-08-25): 코드 분석 기반 분류 결과, "Weekly Batch"는
// 오직 open_spaces 테이블로만 적재하는(events와 전혀 무관한) API 전체로 구성된다 — 고정
// 장소/시설 데이터는 변동 주기가 길어 매일 갱신할 필요가 없다는 것이 기존 ingest-monthly.yml/
// ingest-tourapi-daily.yml에도 이미 깔려 있던 전제였다(제5장 제4조 기존 구조 우선 — 그
// 전제 자체는 유지하고, 스케줄 단위만 "월 1회"/"일부는 매일"로 흩어져 있던 것을 이번 지시대로
// "주간"으로 통일한다).
//
// 실제 코드 확인 결과(각 파일의 super({ targetTable: ... }) 호출 대상을 직접 조사, targetTable
// 이 예외 없이 'open_spaces'인 어댑터 12개 + 레거시 스크립트 1개 = 13개):
//   CITY_PARK, CULTURAL_FACILITY_SUMMARY, LOCALDATA_AMUSEMENT, GG_EVENTS, GO_CAMPING,
//   NATIONAL_PARK_ECOTOUR, LOCALDATA_PLAYGROUND, PUBLIC_FACILITY_OPEN, SWIMMING_POOL,
//   KOR_TOUR_API_V4(×3: KorTour/KorWithTour/KorPetTour — 공유 베이스 TourApiV4AreaBasedAdapter),
//   CULTURE_FACILITY(cultural-spaces.mjs, 레거시 독립 스크립트).
//
// KorTour/GoCamping 계열 4종은 기존에 ingest-tourapi-daily.yml에서 "매일" 실행됐었다(증분
// 수집 파라미터 미지원이라 매일 전량 재수집하는 방식 — implementation/todo.md Task 2 참고).
// 이번 지시는 "events면 Daily, open_spaces 전용이면 Weekly"를 유일한 분류 기준으로 못박았고
// 이 4종은 targetTable이 전부 'open_spaces'이므로 예외 없이 Weekly로 재분류한다 — 증분 수집
// 불가 자체는 여전히 사실이라 Weekly 스케줄에서도 매번 전량 재수집(Full Ingest) 방식은
// 그대로 유지한다(코드 변경 없음, 스케줄 주기만 이동).
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

const BATCH_NAME = 'Weekly Spaces Batch';

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

export async function runWeeklyBatch({ dryRun = false } = {}) {
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
  runWeeklyBatch({ dryRun }).then(({ failedCount }) => {
    process.exitCode = failedCount > 0 ? 1 : 0;
  });
}
