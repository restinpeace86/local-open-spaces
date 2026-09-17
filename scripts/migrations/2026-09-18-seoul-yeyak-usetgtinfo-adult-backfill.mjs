// [원천 필드 직접 반영 — 기존 행 백필](2026-09-18 사용자 지시): "USETGTINFO: 성인으로
// 되어있는거는 연령 ADULT로 자동으로 박아줘." — scripts/ingest/adapters/seoul-yeyak-adapter.mjs를
// 함께 고쳐 앞으로 수집되는 행은 자동으로 반영되지만, 이미 적재된 기존 행은 코드 수정만으로는
// 바뀌지 않는다 — 이 스크립트가 기존 행을 1회성으로 보정한다.
//
// 대상: source='seoul_public_reservation' AND raw_data->>'USETGTINFO'='성인'(정확히 일치,
// 다른 대상과 혼재된 값은 제외) AND target_audience IS NULL. 이미 target_audience가 어떤
// 값으로든 채워진 행(수동 확정 포함)은 절대 건드리지 않는다(제3장 제5조 추측 금지).
//
// [실측 장애 수정](2026-09-18): 가격 백필 스크립트(2026-09-18-seoul-yeyak-payatnm-free-
// price-backfill.mjs)와 동일한 이유로 `.order('id').gt('id', lastId)` 커서 페이지네이션
// 대신 커서 없는 "매번 조건에 맞는 첫 PAGE_SIZE건 조회 → 즉시 UPDATE → 재조회" 패턴을 쓴다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 200;
const SOURCE = 'seoul_public_reservation';

// [실측 버그 수정](2026-09-18): count:exact/head:true 옵션은 .select() 호출 자체에 넘겨야
// 하며, 필터가 이미 걸린 쿼리 빌더에 .select()를 다시 체이닝하면(옵션만 바꿔 재호출) 조용히
// 0건으로 깨진다(실측 확인) — 그래서 count용/목록용 쿼리를 매번 처음부터 새로 만든다.
function applyFilters(query) {
  return query.eq('source', SOURCE).eq('raw_data->>USETGTINFO', '성인').is('target_audience', null);
}

async function main() {
  const client = createAdminClient();

  if (dryRun) {
    const { count, error } = await applyFilters(client.from('events').select('id', { count: 'exact', head: true }));
    if (error) throw new Error(`events 조회 실패: ${error.message}`);
    console.log(`✅ [dry-run] USETGTINFO=성인 & target_audience NULL 대상 ${count ?? 0}건 (실제 반영 안 됨).`);
    return;
  }

  let updated = 0;
  for (;;) {
    const { data, error } = await applyFilters(client.from('events').select('id')).limit(PAGE_SIZE);
    if (error) throw new Error(`events 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    for (let i = 0; i < data.length; i += UPDATE_BATCH_SIZE) {
      const batch = data.slice(i, i + UPDATE_BATCH_SIZE);
      await Promise.all(
        batch.map((row) =>
          client
            .from('events')
            .update({ target_audience: 'ADULT', target_audience_source: 'RAW_FIELD' })
            .eq('id', row.id)
            .is('target_audience', null)
        )
      );
    }
    updated += data.length;
    console.log(`  누적 ${updated}건 반영`);
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`✅ 완료: USETGTINFO=성인 & target_audience NULL → ADULT로 반영 ${updated}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
