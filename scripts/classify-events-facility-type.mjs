// [실내/야외 분류 LLM 파이프라인 일괄 적용](2026-09-17 사용자 지시): "지금 events쪽
// 데이터들에 대하여 indoor/outdoor/both/unknown 인지에 대하여 하나씩 llm을 돌려서
// 다 판단해서 저장해줄래?" — 대상 조건은 (1) is_active=true (2) target_audience가
// INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY 중 하나, 두 조건 AND. 실측 확인(2026-09-17):
// 이 조건에 해당하는 708건 중 477건이 events.facility_type의 기본값 '복합'에
// 그대로 머물러 있었다(실제 판단이 아니라 미분류 방치와 사실상 같음) — 이 스크립트가
// 그 708건 전부를 실제로 LLM에 태워 재판단한다(사용자가 "다 해"라고 명시 — 이미
// '실내'/'야외'인 것도 재검증 대상에 포함).
//
// 이 스크립트는 과거에 쌓인 708건을 처리하는 "일회성 백필"이다. 매일 새로
// 들어오는 건만 처리하는 "일일 배치"는 scripts/ingest/classify-new-events-
// facility-type.mjs를 따로 둔다(둘 다 scripts/ingest/lib/facility-classification.mjs
// 공용 로직을 쓴다 — 제5장 제4조).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/load-env.mjs';
import { classifyOne, sleep, REQUEST_INTERVAL_MS, CLASSIFICATION_TO_FACILITY_TYPE } from './ingest/lib/facility-classification.mjs';

loadEnv();

// [실측 장애 수정 2차](2026-09-17): 첫 순차 실행은 약 440건까지 오류 0건으로 잘
// 처리되다가 이후 모든 요청이 65초씩 4번을 기다려도 계속 429가 나 사실상 멈췄다.
// 직접 호출로 확인한 결과 원인은 분당 한도가 아니라 Gemini 무료 티어의 모델당
// 일일 500회 한도(GenerateRequestsPerDayPerProjectPerModel-FreeTier)였다. 일일
// 한도는 대기해도 그날 안에는 안 풀리므로, 이미 처리한 건을 다음 실행(같은 날 또는
// 다음 날) 때 다시 태우지 않도록 진행 상황을 파일로 남겨 재개 가능하게 한다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.join(__dirname, 'tmp', 'classify-events-facility-type-progress.json');

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

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
// [실측 장애 수정](2026-09-17): 최초 시도(동시 5개, 짧은 재시도 백오프)는 708건 중
// 22건만 성공하고 나머지 686건이 전부 HTTP 429로 실패했다 — 병렬 5개가 시작하자마자
// 한도를 소진했다. 완전 순차 실행(동시 1개) + 요청 사이 고정 대기로 바꿨다.
const CONCURRENCY = 1;

async function fetchTargetRows() {
  const pageSize = 500;
  let from = 0;
  const rows = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, target_audience, facility_type')
      .eq('is_active', true)
      .in('target_audience', TARGET_AUDIENCES)
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`대상 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// 동시 실행 수를 제한하는 아주 단순한 워커 풀(외부 의존성 추가 없이).
async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => next()));
}

// [안전한 실행을 위한 옵션] --limit=N: 처음 N건만 처리(실제 반영 전 소규모 검증용).
// --dry-run: LLM 분류는 실제로 호출하되 DB 업데이트는 건너뛰고 결과만 출력한다.
// --force: 진행 상황 파일을 무시하고 이미 처리한 건도 다시 분류한다.
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
// 연속으로 이만큼 "분당 한도 초과 재시도 4번 다 실패"가 이어지면 분당이 아니라
// 일일 한도로 보고 즉시 중단한다 — 몇 시간을 65초×4 대기만 반복하며 허비하지 않는다.
const CONSECUTIVE_RATE_LIMIT_ABORT_THRESHOLD = 2;

async function run() {
  console.log('📋 대상 조회 중 (is_active=true AND target_audience IN INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY)...');
  let rows = await fetchTargetRows();

  const progress = FORCE ? {} : loadProgress();
  const alreadyDoneCount = rows.filter((r) => progress[r.id]).length;
  if (!FORCE) rows = rows.filter((r) => !progress[r.id]);
  if (LIMIT) rows = rows.slice(0, LIMIT);
  console.log(
    `✅ 대상 ${rows.length}건 확인(이전 실행에서 이미 처리된 ${alreadyDoneCount}건은 건너뜀).${DRY_RUN ? ' (--dry-run: DB 저장 생략)' : ''}`
  );
  if (rows.length === 0) {
    console.log('처리할 대상이 없습니다.');
    return;
  }

  const tally = { INDOOR: 0, OUTDOOR: 0, BOTH: 0, UNKNOWN: 0, error: 0 };
  let done = 0;
  let consecutiveRateLimitFailures = 0;
  let aborted = false;

  await runWithConcurrency(rows, CONCURRENCY, async (row) => {
    if (aborted) return;
    try {
      const result = await classifyOne(row.title, row.description, GEMINI_API_KEY);
      consecutiveRateLimitFailures = 0;
      tally[result.classification] += 1;
      const mapped = CLASSIFICATION_TO_FACILITY_TYPE[result.classification];
      if (mapped && !DRY_RUN) {
        const { error } = await supabase.from('events').update({ facility_type: mapped }).eq('id', row.id);
        if (error) throw new Error(`DB 갱신 실패: ${error.message}`);
      }
      if (DRY_RUN) {
        console.log(`  [dry-run] ${row.id} "${row.title.slice(0, 30)}" 기존=${row.facility_type} → ${mapped ?? '(변경 없음)'} (${result.confidence}, ${result.reason})`);
      } else {
        progress[row.id] = { ...result, mappedFacilityType: mapped ?? null, timestamp: new Date().toISOString() };
        saveProgress(progress);
      }
      // UNKNOWN은 저장할 대응값이 없어 facility_type을 건드리지 않는다(추측 금지,
      // 제3장 제5조) — 기존 값('복합' 기본값 또는 이전 값)이 그대로 남는다.
    } catch (err) {
      tally.error += 1;
      console.error(`❌ [${row.id}] ${row.title.slice(0, 30)}: ${err.message}`);
      if (err.isRateLimit) {
        consecutiveRateLimitFailures += 1;
        if (consecutiveRateLimitFailures >= CONSECUTIVE_RATE_LIMIT_ABORT_THRESHOLD) {
          aborted = true;
          console.error(
            `\n🛑 연속 ${consecutiveRateLimitFailures}건이 분당 한도 재시도(4회, 65초씩)를 모두 소진하고도 실패했습니다 — ` +
              `분당 한도가 아니라 일일 한도로 보입니다. 지금 계속 시도해도 회복되지 않을 가능성이 높아 여기서 중단합니다. ` +
              `할당량이 초기화된 뒤(보통 24시간 이내) 이 스크립트를 다시 실행하면 이미 처리한 건은 자동으로 건너뜁니다.`
          );
        }
      } else {
        consecutiveRateLimitFailures = 0;
      }
    } finally {
      done += 1;
      if (done % 20 === 0 || done === rows.length) {
        console.log(`... ${done}/${rows.length} 처리 (INDOOR ${tally.INDOOR} / OUTDOOR ${tally.OUTDOOR} / BOTH ${tally.BOTH} / UNKNOWN ${tally.UNKNOWN} / 오류 ${tally.error})`);
      }
      // 분당 요청 한도 안에서만 호출하도록 매 요청 사이 고정 간격을 둔다(동시
      // 실행 1개와 함께 작동).
      if (done < rows.length && !aborted) await sleep(REQUEST_INTERVAL_MS);
    }
  });

  console.log('\n📊 최종 결과');
  console.log(`  이번 실행 대상: ${rows.length}건${aborted ? ' (일일 한도로 추정되어 중단됨)' : ''}`);
  console.log(`  INDOOR(→실내로 저장): ${tally.INDOOR}건`);
  console.log(`  OUTDOOR(→야외로 저장): ${tally.OUTDOOR}건`);
  console.log(`  BOTH(→복합으로 저장): ${tally.BOTH}건`);
  console.log(`  UNKNOWN(저장 안 함, 기존 값 유지): ${tally.UNKNOWN}건`);
  console.log(`  오류(저장 안 함): ${tally.error}건`);
  console.log(`  누적 완료(진행 상황 파일 기준): ${Object.keys(progress).length}건`);
}

run().catch((err) => {
  console.error('❌ 스크립트 실행 실패:', err);
  process.exit(1);
});
