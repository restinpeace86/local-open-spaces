// [이마트 상태값만 가볍게 재확인](2026-10-08 사용자 지시): "나중에 이미지
// 빼고.. 신규건만가져오던가 초간단하게 상태값만 읽어오는 방법은 없을까?
// 최대한 경량화로?" → "이마트 쪽 배치는 최적화 구현해줘 할수있으면 해야지"
//
// [실측으로 확인한 전제] getClassByFiltering의 classId 필터는 단건이 아니라
// 배열을 받는다(실측: class_id 500개를 한 요청에 넣어도 120~150ms로 정상
// 동작) — 전체 ~6,563건(is_excluded=false)을 500개씩 묶어 classStatus 3개
// 버킷(접수중/정원마감/접수대기)만 확인하면, 하루 1회 전체 필드 재수집
// (emart-culture-club.mjs)을 기다리지 않고도 상태 변화(접수 시작/마감)를
// 훨씬 자주 반영할 수 있다 — 약 14청크 × 3버킷 = 42회 요청 수준(실측
// 500개 기준 1회 요청 120~150ms, 버킷 사이 1~1.5초 페이싱).
//
// [롯데마트는 동일 방식 불가 — 실측 확인](2026-10-08): courseview.do에
// cls_cd를 콤마로 여러 개 묶어 보내면 "잘못된 경로로 접속하셨거나 인터넷
// 미노출 강좌 정보입니다" 에러 응답만 돌아온다(124 bytes) — 단건 요청만
// 지원한다. 롯데마트는 계속 매일 전체 재수집이 상태 갱신의 유일한 방법이다.
//
// [이 스크립트가 바꾸는 것 — 범위](제5장 제3조 임의 판단 금지): raw_status/
// normalized_status 두 컬럼만 갱신한다. 이미지/강사명/교실 등 나머지 필드는
// 그대로 둔다(그건 여전히 매일 1회 emart-culture-club.mjs가 전체 재수집).
// is_excluded=true인 행(관리자가 노출을 끈 행)은 대상에서 제외한다.
//
// [Discord 알림 생략 — 기존 관례](culture-club-status-watch.mjs와 동일):
// 5분 주기 찜 감시 스크립트도 성공 시 Discord를 보내지 않고 pipeline_logs만
// 남긴다 — 이 스크립트도 30분마다 도는 "잦은" 배치라 같은 관례를 따른다
// (실패 시에는 pipeline_logs 기록 후 예외를 그대로 던져 작업 스케줄러가
// 비정상 종료 코드로 인식하게 한다).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { normalizeEmartStatus } from './lib/culture-club-common.mjs';
import { fetchEmartStatusesBatch } from './lib/culture-club-status-fetchers.mjs';

const env = loadEnv();
const SOURCE_KEY = 'EMART_CULTURE_CLUB_STATUS_REFRESH';
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
// [랜덤 시작 지연] 30분 주기라 다른 일일 배치(최대 10분)처럼 길게 흔들면
// "30분마다"라는 약속이 무너진다 — 5분 주기 찜 감시와 동일하게 최대 30초만.
const MAX_STARTUP_DELAY_MS = 30 * 1000;
const DB_PAGE_SIZE = 1000;

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

async function fetchAllEmartRows(client) {
  const rows = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('source_class_id, raw_status, normalized_status')
      .eq('brand', 'emart')
      .eq('is_excluded', false)
      .range(from, from + DB_PAGE_SIZE - 1);
    if (error) throw new Error(`culture_club_classes 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < DB_PAGE_SIZE) break;
    from += DB_PAGE_SIZE;
  }
  return rows;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '이마트 컬처클럽 상태값(raw_status/normalized_status)만 배치 조회로 가볍게 재확인 — 전체 필드 재수집 아님',
      period: null, // 30분 주기 — culture-club-status-watch.mjs와 동일하게 'daily'/'monthly' 둘 다 거짓(제3장 제5조).
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export function diffChangedStatuses(rows, newRawStatusById) {
  return rows
    .map((row) => {
      const newRawStatus = newRawStatusById.get(row.source_class_id);
      const newNormalizedStatus = normalizeEmartStatus(newRawStatus);
      if (newRawStatus === row.raw_status && newNormalizedStatus === row.normalized_status) return null;
      return { source_class_id: row.source_class_id, raw_status: newRawStatus, normalized_status: newNormalizedStatus };
    })
    .filter(Boolean);
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 이마트 컬처클럽 상태 경량 재확인 시작 (dry-run: ${dryRun})`);
  const startedAt = Date.now();
  const client = createAdminClient();

  const rows = await fetchAllEmartRows(client);
  console.log(`  대상 ${rows.length}건 조회`);

  if (rows.length === 0) {
    await postPipelineLog(client, { status: 'OK', metaData: { totalCount: 0, changedCount: 0 } });
    return { sourceKey: SOURCE_KEY, totalCount: 0, changedCount: 0, updated: false };
  }

  const classIds = rows.map((row) => row.source_class_id);
  const newRawStatusById = await fetchEmartStatusesBatch({
    apiKey: env.EMART_CULTURE_CLUB_API_KEY,
    classIds,
    pacingDelayMs: randomPacingDelay,
  });

  const changed = diffChangedStatuses(rows, newRawStatusById);
  console.log(`✅ 상태 변경 ${changed.length}건 / 전체 ${rows.length}건 (${((Date.now() - startedAt) / 1000).toFixed(1)}초)`);

  if (dryRun) {
    console.log(JSON.stringify(changed.slice(0, 10), null, 2));
    return { sourceKey: SOURCE_KEY, totalCount: rows.length, changedCount: changed.length, updated: false };
  }

  try {
    for (const row of changed) {
      const { error } = await client
        .from('culture_club_classes')
        .update({ raw_status: row.raw_status, normalized_status: row.normalized_status, updated_at: new Date().toISOString() })
        .eq('brand', 'emart')
        .eq('source_class_id', row.source_class_id);
      if (error) throw new Error(`상태 갱신 실패(class_id=${row.source_class_id}): ${error.message}`);
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  await postPipelineLog(client, { status: 'OK', metaData: { totalCount: rows.length, changedCount: changed.length } });
  return { sourceKey: SOURCE_KEY, totalCount: rows.length, changedCount: changed.length, updated: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run({ dryRun }))
    .catch((err) => {
      console.error(`❌ 이마트 상태 경량 재확인 실패: ${err.message}`);
      process.exit(1);
    });
}
