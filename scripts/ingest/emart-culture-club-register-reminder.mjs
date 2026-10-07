// [이마트 접수시작 10분 전 사전 알림](2026-10-08 사용자 지시): "신청시작전
// 혹은 신청시작하자마자 뜨는게 중요한데" → "10분전 괜찮겠지" — 기존
// culture-club-status-watch.mjs(5분 주기)는 상태가 "이미 바뀐 뒤"에만
// 반응하는 사후 감시라, 접수 시작 "전"에 미리 알려주는 사전 알림은 별도
// 스크립트로 둔다.
//
// [이마트만 가능 — 실측/기존 기록 확인] register_start_at(접수 시작 시각)은
// 이마트만 파싱해 저장한다(classDateInfo.classRegisterStartDate, 실측
// "YYYYMMDDHHmm" 12자). 롯데마트/현대백화점은 culture-club-unified-row.mjs
// 에 이미 "이 개념 자체가 없다"(실측 확인, 사이트에 노출 안 됨)로 기록돼
// 있어 register_start_at이 항상 null이다 — 사전 알림 대상이 될 수 없다.
//
// [주기 — 5분](culture-club-status-watch.mjs와 동일): 10분 전이라는 목표
// 시각을 5분 주기로 "지금부터 10~15분 뒤에 시작하는 강좌"를 찾아 알리는
// 식으로 운용한다(폭 5분 창 — 10분 단일 시점을 정확히 맞히긴 어려우므로,
// 한 번은 반드시 이 창 안에 걸리게 함). register_reminder_sent_at으로
// 중복 발송을 막는다(다음 5분 주기에 같은 강좌가 창에 다시 걸려도 건너뜀).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { configureWebPush, sendPushToBookmarkers } from './lib/culture-club-push.mjs';

loadEnv();

const SOURCE_KEY = 'EMART_CULTURE_CLUB_REGISTER_REMINDER';
// [알림 시점 — 사용자 확정] "10분전 괜찮겠지"
const REMINDER_LEAD_MINUTES = 10;
// [조회 창 — 5분 주기와 맞춤] 5분마다 돌므로, 창 폭도 5분으로 둬야 모든
// 강좌가 "정확히 한 번" 창에 걸린다(창이 더 좁으면 실행 사이 틈에 빠질 수
// 있고, 더 넓으면 register_reminder_sent_at 가드가 없다면 중복 발송된다).
const REMINDER_WINDOW_MINUTES = 5;
const MAX_STARTUP_DELAY_MS = 30 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '이마트 컬처클럽 접수 시작 10분 전 사전 알림(찜한 유저 대상)',
      period: null, // 5분 주기 — 'daily'/'monthly' 둘 다 거짓(제3장 제5조).
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export function computeReminderWindow(now) {
  const windowStart = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60 * 1000);
  const windowEnd = new Date(windowStart.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);
  return { windowStart, windowEnd };
}

export async function run({ now = new Date(), dryRun = false } = {}) {
  const admin = createAdminClient();

  const { windowStart, windowEnd } = computeReminderWindow(now);

  const { data: rows, error } = await admin
    .from('culture_club_classes')
    .select('id, class_title, register_start_at')
    .eq('brand', 'emart')
    .eq('is_excluded', false)
    .is('register_reminder_sent_at', null)
    .gte('register_start_at', windowStart.toISOString())
    .lt('register_start_at', windowEnd.toISOString());
  if (error) throw new Error(`culture_club_classes 조회 실패: ${error.message}`);

  console.log(`▶ 이마트 접수시작 사전 알림 (dry-run: ${dryRun}) — 대상 ${rows.length}건 (${windowStart.toISOString()} ~ ${windowEnd.toISOString()})`);

  if (dryRun) {
    console.log(JSON.stringify(rows, null, 2));
    return { targetCount: rows.length, sentCount: 0, expiredCount: 0 };
  }

  configureWebPush();
  let sentCount = 0;
  let expiredCount = 0;

  try {
    for (const row of rows ?? []) {
      const result = await sendPushToBookmarkers(admin, row.id, {
        title: '⏰ 찜한 강좌 접수 예정',
        body: `"${row.class_title}" ${REMINDER_LEAD_MINUTES}분 후 접수가 시작돼요!`,
        logPrefix: SOURCE_KEY,
      });
      sentCount += result.sentCount;
      expiredCount += result.expiredCount;

      const { error: markError } = await admin
        .from('culture_club_classes')
        .update({ register_reminder_sent_at: now.toISOString() })
        .eq('id', row.id);
      if (markError) console.error(`[${SOURCE_KEY}] id=${row.id} 발송 표시 실패: ${markError.message}`);

      console.log(`  [${row.id}] "${row.class_title}" 푸시 ${result.sentCount}건 발송`);
      await sleep(100);
    }
  } catch (err) {
    await postPipelineLog(admin, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ 완료 — 대상 ${rows.length}건, 푸시 발송 ${sentCount}건, 만료 정리 ${expiredCount}건`);
  await postPipelineLog(admin, { status: 'OK', metaData: { targetCount: rows.length, sentCount, expiredCount } });
  return { targetCount: rows.length, sentCount, expiredCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run({ dryRun }))
    .then(({ sentCount }) => {
      console.log(`▶▶▶ [${SOURCE_KEY}] 종료: ${sentCount}건 발송`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [${SOURCE_KEY}] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
