// [실내/야외 분류 LLM 파이프라인 — 매일 신규분](2026-09-17 사용자 지시): "이것들
// 관련하여서는 매일 새로 들어오는거에 대하여 돌수 있도록 배치로 만들어줄수 있나?
// 일단 오늘 신규 반영된 건들에 한해서" — 과거 누적분(708건)을 한 번에 처리하는
// scripts/classify-events-facility-type.mjs(일회성 백필)와 달리, 이 스크립트는
// "오늘(KST) 새로 생성된" 행만 매일 대상으로 삼는다. 대상 조건은 백필과 동일하게
// (1) is_active=true (2) target_audience IN (INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY).
//
// [일일 수집 파이프라인과 같은 Gemini 할당량 공유](2026-09-17 실측): 이 프로젝트의
// 일일 수집 배치(scripts/ingest/run-daily.mjs)도 카테고리 분류에 이미 Gemini를
// 쓰고 있어(scripts/ingest/lib/ai-tagging.mjs) 같은 무료 티어 일일 500회/모델
// 한도를 공유한다. 신규 유입 건수는 누적분(708건)보다 훨씬 적을 것으로 예상되지만
// (실측 확인 필요), 그래도 안전하게 순차 실행 + 요청 간 대기 + 일일 한도 감지 시
// 조기 중단을 그대로 적용한다.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../lib/load-env.mjs';
import { classifyOne, sleep, REQUEST_INTERVAL_MS, CLASSIFICATION_TO_FACILITY_TYPE } from './lib/facility-classification.mjs';
import { todayStartIsoKst } from './lib/kst-date-range.mjs';
import { EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS } from './lib/category-min-groups.mjs';

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY가 없습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TARGET_AUDIENCES = ['INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY'];
// 연속으로 이만큼 "분당 한도 재시도 4회 다 실패"가 이어지면 일일 한도로 보고 중단한다
// (일회성 백필 스크립트와 동일한 안전장치).
const CONSECUTIVE_RATE_LIMIT_ABORT_THRESHOLD = 2;

// [실내/야외 LLM 분류 배치 제외 대상](2026-09-18 사용자 지시): 백필 스크립트
// (scripts/classify-events-facility-type.mjs)와 동일한 이유로 체육시설/배움·교육/
// 공공청사·행정 대분류는 제외한다 — NULL 3값 논리 함정을 피하기 위해 클라이언트 측 필터링.
function isExcludedFromFacilityClassification(categoryMin) {
  return categoryMin != null && EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS.includes(categoryMin);
}

async function fetchTodayNewRows() {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, target_audience, facility_type, created_at, category_min, venue_name')
    .eq('is_active', true)
    .in('target_audience', TARGET_AUDIENCES)
    .gte('created_at', todayStartIsoKst())
    .order('id');
  if (error) throw new Error(`대상 조회 실패: ${error.message}`);
  const filtered = data.filter((row) => !isExcludedFromFacilityClassification(row.category_min));
  return { rows: filtered, excludedCount: data.length - filtered.length };
}

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  console.log(`📋 오늘(KST) 신규 반영분 조회 중 (created_at >= ${todayStartIsoKst()})...`);
  const { rows, excludedCount } = await fetchTodayNewRows();
  console.log(
    `✅ 대상 ${rows.length}건 확인(체육시설/배움교육/공공청사행정 대분류 ${excludedCount}건은 토큰 낭비 방지를 위해 제외).${DRY_RUN ? ' (--dry-run: DB 저장 생략)' : ''}`
  );
  if (rows.length === 0) {
    console.log('오늘 신규로 조건에 맞는 건이 없습니다 — 종료합니다.');
    return;
  }

  const tally = { INDOOR: 0, OUTDOOR: 0, BOTH: 0, UNKNOWN: 0, error: 0 };
  let consecutiveRateLimitFailures = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      const result = await classifyOne(row.title, row.description, GEMINI_API_KEY, {
        categoryMin: row.category_min,
        venueName: row.venue_name,
      });
      consecutiveRateLimitFailures = 0;
      tally[result.classification] += 1;
      const mapped = CLASSIFICATION_TO_FACILITY_TYPE[result.classification];
      if (mapped && !DRY_RUN) {
        const { error } = await supabase.from('events').update({ facility_type: mapped }).eq('id', row.id);
        if (error) throw new Error(`DB 갱신 실패: ${error.message}`);
      }
      console.log(`  [${i + 1}/${rows.length}] "${row.title.slice(0, 30)}" → ${mapped ?? 'UNKNOWN(유지)'} (${result.confidence})`);
      // UNKNOWN은 저장할 대응값이 없어 facility_type을 건드리지 않는다(추측 금지, 제3장 제5조).
    } catch (err) {
      tally.error += 1;
      console.error(`  ❌ [${row.id}] "${row.title.slice(0, 30)}": ${err.message}`);
      if (err.isRateLimit) {
        consecutiveRateLimitFailures += 1;
        if (consecutiveRateLimitFailures >= CONSECUTIVE_RATE_LIMIT_ABORT_THRESHOLD) {
          console.error('🛑 일일 한도로 추정되어 중단합니다 — 남은 건은 다음 실행 때 다시 조회 대상이 됩니다.');
          break;
        }
      } else {
        consecutiveRateLimitFailures = 0;
      }
    }
    if (i < rows.length - 1) await sleep(REQUEST_INTERVAL_MS);
  }

  console.log('\n📊 오늘 신규분 처리 결과');
  console.log(`  INDOOR(→실내): ${tally.INDOOR}건 / OUTDOOR(→야외): ${tally.OUTDOOR}건 / BOTH(→복합): ${tally.BOTH}건`);
  console.log(`  UNKNOWN(유지): ${tally.UNKNOWN}건 / 오류: ${tally.error}건`);
}

run().catch((err) => {
  console.error('❌ 스크립트 실행 실패:', err);
  process.exit(1);
});
