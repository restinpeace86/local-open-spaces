// [문화센터 썸네일 재호스팅 — 독립 배치](2026-10-08 사용자 지시): "이미지
// 긁어오는거 우리 썸네일 규격이라던가 우리쪽 규격에 맞추는것도 하는거지?"
// 핵심 로직은 lib/rehost-culture-club-thumbnails.mjs — 이 파일은 다른
// 브랜드별 배치들과 동일하게 독립 실행/스케줄(Windows 작업 스케줄러)
// 가능한 진입점만 제공한다(events의 재호스팅은 run-daily.mjs에 포함돼
// 있지만, 문화센터는 run-daily.mjs를 거치지 않는 별도 배치군이라 자체
// 스크립트로 둔다).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { rehostCultureClubThumbnails } from './lib/rehost-culture-club-thumbnails.mjs';

loadEnv();

const SOURCE_KEY = 'CULTURE_CLUB_REHOST_THUMBNAILS';
// [하루 100건 — events와 동일한 예산](2026-09-15 사용자 지시 근거 재사용)
// 매 행마다 외부 네트워크 fetch + 리사이징 + 업로드가 들어가 느리다 —
// 전체 백로그는 매일 조금씩 처리되며, 이미 재호스팅된 행은 조회 조건
// 자체에서 자동으로 빠진다(멱등적).
const BATCH_SIZE = 100;
// [랜덤 시작 지연] 하루 1회 배치 — 다른 브랜드 배치들과 동일한 관례.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '문화센터(롯데마트/현대백화점/신세계 아카데미) 강좌 썸네일을 원천 URL에서 다운로드→리사이징→우리 Storage로 재호스팅(하루 최대 100건)',
      period: null, // 하루 1회지만 'daily' 전용 의미(원천 재수집)와 달라 기존 REHOST_EVENT_THUMBNAILS 관례를 따르지 않고 명시적으로 null — 제3장 제5조.
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run() {
  console.log('▶ 문화센터 썸네일 재호스팅 시작');
  const client = createAdminClient();

  try {
    const { processed, succeeded, failed, skipped } = await rehostCultureClubThumbnails(client, { limit: BATCH_SIZE });
    console.log(`✅ 재호스팅 완료 — 대상 ${processed}건 중 성공 ${succeeded}건, 실패 ${failed}건, 건너뜀 ${skipped}건`);
    await postPipelineLog(client, { status: 'OK', metaData: { processed, succeeded, failed, skipped } });
    return { sourceKey: SOURCE_KEY, processed, succeeded, failed, skipped };
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run())
    .catch((err) => {
      console.error(`❌ 문화센터 썸네일 재호스팅 실패: ${err.message}`);
      process.exit(1);
    });
}
