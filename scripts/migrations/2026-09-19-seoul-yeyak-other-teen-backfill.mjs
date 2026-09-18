// [원천 필드 직접 반영 — 기존 행 백필](2026-09-19 사용자 지시): "613건 리스트에 대해
// 내가 직접 명시한 것만 — OTHER(단체/여성/장애인), TEEN(고학년/4학년이상)." —
// scripts/ingest/adapters/seoul-yeyak-adapter.mjs에 classifyTargetAudienceFromUseTgtInfo를
// 추가해 앞으로 수집되는 행은 자동 반영되지만, 이미 적재된 기존 행은 코드 수정만으로는
// 바뀌지 않는다 — 이 스크립트가 기존 행을 1회성으로 보정한다.
//
// 대상: source='seoul_public_reservation' AND target_audience IS NULL 인 행 중
// classifyTargetAudienceFromUseTgtInfo(raw_data.USETGTINFO)가 OTHER 또는 TEEN을
// 반환하는 것만. 이미 target_audience가 어떤 값으로든 채워진 행(수동 확정 포함)은
// 절대 건드리지 않는다(제3장 제5조 추측 금지).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { classifyTargetAudienceFromUseTgtInfo } from '../ingest/adapters/seoul-yeyak-adapter.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const PAGE_SIZE = 500;
const SOURCE = 'seoul_public_reservation';

async function main() {
  const client = createAdminClient();
  let lastId = null;
  let scanned = 0;
  const tally = { OTHER: 0, TEEN: 0 };

  for (;;) {
    let query = client
      .from('events')
      .select('id, raw_data')
      .eq('source', SOURCE)
      .is('target_audience', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    const { data, error } = await query;
    if (error) throw new Error(`events 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;
    for (const row of data) {
      const tag = classifyTargetAudienceFromUseTgtInfo(row.raw_data?.USETGTINFO);
      if (!tag) continue;
      tally[tag] += 1;
      if (!dryRun) {
        const { error: updateError } = await client
          .from('events')
          .update({ target_audience: tag, target_audience_source: 'RAW_FIELD' })
          .eq('id', row.id)
          .is('target_audience', null);
        if (updateError) console.error(`  ❌ [${row.id}] 업데이트 실패: ${updateError.message}`);
      }
    }

    console.log(`  누적 스캔 ${scanned}건 (OTHER ${tally.OTHER} / TEEN ${tally.TEEN})${dryRun ? ' [dry-run]' : ''}`);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`\n✅ 완료: 스캔 ${scanned}건 / OTHER 반영 ${tally.OTHER}건 / TEEN 반영 ${tally.TEEN}건${dryRun ? ' (dry-run, 실제 반영 안 됨)' : ''}`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
