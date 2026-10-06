// [문화센터 통합 테이블 1단계 — 데이터 복사](project/decision-log.md Decision
// 028): emart_culture_club_classes/lottemart_culture_club_classes의 기존
// 데이터를 culture_club_classes로 그대로 복사한다. 이 스크립트는 "무손상
// 복사"만 한다 — 기존 두 테이블, 그리고 이를 참조하는 기존 코드(수집/관리자/
// 프론트엔드/찜)는 전혀 건드리지 않는다. 수집 스크립트의 쓰기 대상을
// culture_club_classes로 바꾸는 컷오버는 별도 후속 작업이다.
//
// 멱등: UNIQUE(brand, source_class_id) 제약을 이용해 upsert로 실행 — 재실행해도
// 안전하다(원본 테이블이 그 사이 갱신됐으면 최신 값으로 덮어씀).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';
import { toUnifiedEmartRow, toUnifiedLottemartRow } from '../ingest/lib/culture-club-unified-row.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const PAGE_SIZE = 500;
const UPSERT_CHUNK_SIZE = 500;

async function copyTable(client, { table, mapFn, label }) {
  let lastId = null;
  let scanned = 0;
  let upserted = 0;

  for (;;) {
    let query = client.from(table).select('*').order('id', { ascending: true }).limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;

    if (!dryRun) {
      const rows = data.map(mapFn);
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
        // eslint-disable-next-line no-await-in-loop
        const { error: upsertError } = await client
          .from('culture_club_classes')
          .upsert(chunk, { onConflict: 'brand,source_class_id' });
        if (upsertError) throw new Error(`culture_club_classes(${label}) upsert 실패: ${upsertError.message}`);
        upserted += chunk.length;
      }
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { label, scanned, upserted };
}

async function main() {
  const client = createAdminClient();
  console.log(`▶ 문화센터 통합 테이블 데이터 복사 시작 (dry-run: ${dryRun})`);

  const results = [];
  results.push(await copyTable(client, { table: 'emart_culture_club_classes', mapFn: toUnifiedEmartRow, label: 'emart' }));
  results.push(await copyTable(client, { table: 'lottemart_culture_club_classes', mapFn: toUnifiedLottemartRow, label: 'lottemart' }));

  console.log(JSON.stringify(results, null, 2));
  return results;
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
