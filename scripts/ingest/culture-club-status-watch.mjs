// [찜한 문화센터 강좌 상태 변화 알림 — 통합](2026-10-06, project/decision-
// log.md Decision 028): emart-culture-club-status-watch.mjs/lottemart-
// culture-club-status-watch.mjs 두 스크립트를 하나로 합쳤다. 사용자 지시:
// "찜이 됐는데 이게 어떤거냐 이벤트냐 이마트냐 롯데마트냐를 구분하고 그에
// 따라 재확인로직이 분기해가야겠지?" — user_bookmarks.culture_club_class_id
// 로 통합된 찜을 culture_club_classes.brand로 먼저 식별하고, 브랜드별 재확인
// 로직(scripts/ingest/lib/culture-club-status-fetchers.mjs)으로 분기한다.
// 사이트 구조가 완전히 다른 두 수집 방식(이마트 GraphQL API, 롯데마트 HTML
// 스크래핑)은 그대로 유지한다 — 통합되는 건 "찜 테이블/상태 저장 테이블"
// 뿐이다. 행 단위 try/catch를 유지해 한 건(또는 한 브랜드)의 재확인 실패가
// 다른 행/다른 브랜드의 재확인을 막지 않는다(사용자 명시 요구사항).
//
// [실행 환경 — 이마트 제약 때문에 로컬 PC로](emart-culture-club-batch.yml.
// disabled와 동일한 이유): 이마트 쪽 재확인(classId+classStatus 필터)이
// GitHub Actions에서 WAFForbiddenException(403)에 막힌다 — 통합 스크립트가
// 두 브랜드를 한 번에 처리하므로, 전체를 로컬 PC 작업 스케줄러로 실행한다
// (롯데마트 쪽만 보면 GitHub Actions에서도 문제없이 동작했지만, 이마트가
// 섞인 이상 더 제약이 큰 쪽(로컬 PC)에 맞춰야 한다).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { normalizeEmartStatus, normalizeLottemartStatus } from './lib/culture-club-common.mjs';
import { fetchEmartCurrentStatus, fetchLottemartCurrentStatus } from './lib/culture-club-status-fetchers.mjs';
import { configureWebPush, sendPushToBookmarkers } from './lib/culture-club-push.mjs';

const env = loadEnv();
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
// [랜덤 시작 지연] 5분 주기라 다른 배치들처럼 몇 분씩 늘리면 "5분마다"라는
// 약속이 무너진다 — 기존 두 스크립트와 동일하게 최대 30초로 작게만 흔든다.
const MAX_STARTUP_DELAY_MS = 30 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

// [브랜드별 분기 — 사용자 지시] 새 브랜드(AK플라자 등)가 추가될 때 이 맵에
// 한 항목만 추가하면 된다. 아직 등록되지 않은 브랜드는 조용히 건너뛴다
// (추측으로 재확인 로직을 지어내지 않음 — 제3장 제5조).
const BRAND_ADAPTERS = {
  emart: {
    actionableRawStatuses: new Set(['접수중', '정원마감']),
    normalize: normalizeEmartStatus,
    fetchCurrentRawStatus: (row) =>
      fetchEmartCurrentStatus({
        apiKey: env.EMART_CULTURE_CLUB_API_KEY,
        sourceClassId: row.source_class_id,
        pacingDelayMs: randomPacingDelay,
      }),
    pushBody: (newStatus) => (newStatus === '접수중' ? '온라인 접수가 시작됐어요!' : '대기 등록(취소 시 등록 가능)이 가능해졌어요!'),
  },
  lottemart: {
    actionableRawStatuses: new Set(['바로신청', '대기자신청']),
    normalize: normalizeLottemartStatus,
    fetchCurrentRawStatus: (row) =>
      fetchLottemartCurrentStatus({
        storeCode: row.store_code,
        sourceClassId: row.source_class_id,
        semesterCode: row.raw_extra?.semester_code,
        targetCode: row.raw_extra?.target_code,
      }),
    pushBody: (newStatus) => (newStatus === '바로신청' ? '온라인 접수가 시작됐어요!' : '대기자 신청이 가능해졌어요!'),
  },
};

export function isNewlyActionable(actionableRawStatuses, oldStatus, newStatus) {
  return !actionableRawStatuses.has(oldStatus) && actionableRawStatuses.has(newStatus);
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: 'CULTURE_CLUB_STATUS_WATCH',
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '찜한 문화센터 강좌(브랜드 무관)만 재확인해 접수 가능 전환 시 푸시',
      period: null, // 5분 주기 — 'daily'/'monthly' 둘 다 거짓이다(제3장 제5조).
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run() {
  configureWebPush();
  const admin = createAdminClient();

  const { data: bookmarkRows, error: bookmarkError } = await admin
    .from('user_bookmarks')
    .select('culture_club_class_id')
    .not('culture_club_class_id', 'is', null);
  if (bookmarkError) throw new Error(`찜한 강좌 목록 조회 실패: ${bookmarkError.message}`);

  const classIds = [...new Set((bookmarkRows ?? []).map((r) => r.culture_club_class_id))];
  console.log(`▶ 찜한 문화센터 강좌 상태 감시 시작 — 대상 ${classIds.length}건`);

  if (classIds.length === 0) {
    await postPipelineLog(admin, { status: 'OK', metaData: { targetCount: 0, changedCount: 0, sentCount: 0 } });
    return { targetCount: 0, changedCount: 0, sentCount: 0 };
  }

  const { data: rows, error: rowsError } = await admin
    .from('culture_club_classes')
    .select('id, brand, source_class_id, class_title, store_code, raw_status, raw_extra')
    .in('id', classIds);
  if (rowsError) throw new Error(`강좌 정보 조회 실패: ${rowsError.message}`);

  let changedCount = 0;
  let sentCount = 0;
  let expiredCount = 0;
  let skippedUnknownBrand = 0;

  try {
    for (const row of rows ?? []) {
      const adapter = BRAND_ADAPTERS[row.brand];
      if (!adapter) {
        skippedUnknownBrand += 1;
        console.error(`[CULTURE_CLUB_STATUS_WATCH] 브랜드 '${row.brand}'의 재확인 로직이 아직 없어 건너뜀 (id=${row.id})`);
        continue;
      }

      let newRawStatus;
      try {
        newRawStatus = await adapter.fetchCurrentRawStatus(row);
      } catch (err) {
        console.error(`[CULTURE_CLUB_STATUS_WATCH] ${row.brand}/${row.source_class_id} 상태 조회 실패: ${err.message}`);
        await sleep(randomPacingDelay());
        continue;
      }

      if (newRawStatus !== row.raw_status) {
        changedCount += 1;
        const { error: updateError } = await admin
          .from('culture_club_classes')
          .update({ raw_status: newRawStatus, normalized_status: adapter.normalize(newRawStatus) })
          .eq('id', row.id);
        if (updateError) console.error(`[CULTURE_CLUB_STATUS_WATCH] id=${row.id} 상태 갱신 실패: ${updateError.message}`);

        if (isNewlyActionable(adapter.actionableRawStatuses, row.raw_status, newRawStatus)) {
          const result = await sendPushToBookmarkers(admin, row.id, {
            title: '🔔 찜한 강좌 접수 가능',
            body: `"${row.class_title}" ${adapter.pushBody(newRawStatus)}`,
            logPrefix: 'CULTURE_CLUB_STATUS_WATCH',
          });
          sentCount += result.sentCount;
          expiredCount += result.expiredCount;
          console.log(`  [${row.brand}/${row.source_class_id}] ${row.raw_status} → ${newRawStatus}, 푸시 ${result.sentCount}건 발송`);
        }
      }

      await sleep(randomPacingDelay());
    }
  } catch (err) {
    await postPipelineLog(admin, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(
    `✅ 완료 — 대상 ${classIds.length}건 중 상태 변경 ${changedCount}건, 푸시 발송 ${sentCount}건, 만료 정리 ${expiredCount}건, 브랜드 미지원 건너뜀 ${skippedUnknownBrand}건`
  );
  await postPipelineLog(admin, {
    status: 'OK',
    metaData: { targetCount: classIds.length, changedCount, sentCount, expiredCount, skippedUnknownBrand },
  });
  return { targetCount: classIds.length, changedCount, sentCount, expiredCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run())
    .then(({ sentCount }) => {
      console.log(`▶▶▶ [CULTURE_CLUB_STATUS_WATCH] 종료: ${sentCount}건 발송`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [CULTURE_CLUB_STATUS_WATCH] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
