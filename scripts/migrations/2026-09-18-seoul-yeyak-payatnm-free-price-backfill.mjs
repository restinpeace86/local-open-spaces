// [원천 필드 직접 반영 — 기존 행 백필](2026-09-18 사용자 지시): "seoul_public_reservation
// 이 원천소스에 PAYATNM: 무료로 되어있는데 이건 가격이 무료로 되어있는거 아니야? 해당
// 항목들에 대하여서는 가격 무료로 박아줘." — scripts/ingest/adapters/seoul-yeyak-adapter.mjs를
// 함께 고쳐 앞으로 수집되는 행은 자동으로 반영되지만, 이미 적재된 기존 행은 코드 수정만으로는
// 바뀌지 않는다(재수집 전까지 그대로) — 이 스크립트가 기존 행을 1회성으로 보정한다.
//
// 대상: source='seoul_public_reservation' AND raw_data->>'PAYATNM'='무료' AND price_text IS NULL.
// price_text가 이미 채워져 있는 행(예: "참가비 무료"/"관람료 무료" — parsePriceFromText가 이미
// DTLCONT에서 라벨+무료 패턴을 찾아낸 경우)은 건드리지 않는다 — 이미 정확한 값이 있는데
// 덮어쓸 이유가 없고, 혹시 있을 수동 확정 값도 보존한다(제3장 제5조 추측 금지 — 안전한 쪽만).
//
// [실측 장애 수정](2026-09-18): 처음엔 `.order('id').gt('id', lastId)` 커서 페이지네이션을
// 썼는데, id(UUID)가 source/조건과 물리적으로 무관한 순서라 뒤 페이지로 갈수록 테이블 전체를
// 훑어야 해 statement timeout이 났다(project 기존에도 SEOUL_YEYAK upsert에서 같은 증상 진단
// 이력 있음, scripts/ingest/lib/supabase-admin.mjs 참고). 커서 없이 매번 조건에 맞는 첫
// PAGE_SIZE건만 가져와 즉시 UPDATE하면, 다음 조회 때는 이미 갱신된 행이 자연히 대상에서
// 빠져 커서 없이도 안전하게 수렴한다(실측: 커서 버전은 8초+ 타임아웃, 이 버전은 페이지당 1초
// 내외).
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
  return query.eq('source', SOURCE).eq('raw_data->>PAYATNM', '무료').is('price_text', null);
}

async function main() {
  const client = createAdminClient();

  if (dryRun) {
    const { count, error } = await applyFilters(client.from('events').select('id', { count: 'exact', head: true }));
    if (error) throw new Error(`events 조회 실패: ${error.message}`);
    console.log(`✅ [dry-run] PAYATNM=무료 & price_text NULL 대상 ${count ?? 0}건 (실제 반영 안 됨).`);
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
          client.from('events').update({ price_text: '무료' }).eq('id', row.id).is('price_text', null)
        )
      );
    }
    updated += data.length;
    console.log(`  누적 ${updated}건 반영`);
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`✅ 완료: PAYATNM=무료 & price_text NULL → '무료'로 반영 ${updated}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
