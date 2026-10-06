// [찜 FK 통합 — 데이터 백필](project/decision-log.md Decision 028): 기존
// user_bookmarks.emart_class_id/lottemart_class_id 값을 culture_club_classes
// (brand+source_class_id)로 매칭해 culture_club_class_id를 채운다. 매칭 실패
// (orphan)가 있으면 명확히 보고한다 — CHECK 제약/컬럼 정리는 orphan이 0건임을
// 확인한 뒤 별도 마이그레이션에서 진행한다(추측으로 그냥 진행하지 않음).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const PAGE_SIZE = 500;

async function buildClassIndex(client, brand) {
  const index = new Map();
  let lastId = null;
  for (;;) {
    let query = client
      .from('culture_club_classes')
      .select('id, source_class_id')
      .eq('brand', brand)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`culture_club_classes(${brand}) 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) index.set(row.source_class_id, row.id);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }
  return index;
}

async function migrateBrand(client, { brand, bookmarkColumn }) {
  const index = await buildClassIndex(client, brand);

  let lastId = null;
  let scanned = 0;
  let matched = 0;
  const orphans = [];

  for (;;) {
    let query = client
      .from('user_bookmarks')
      .select(`id, ${bookmarkColumn}`)
      .not(bookmarkColumn, 'is', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`user_bookmarks(${bookmarkColumn}) 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;

    for (const row of data) {
      const classId = row[bookmarkColumn];
      const resolvedId = index.get(classId);
      if (resolvedId === undefined) {
        orphans.push({ bookmarkId: row.id, classId });
        continue;
      }
      matched += 1;
      if (!dryRun) {
        // eslint-disable-next-line no-await-in-loop
        const { error: updateError } = await client
          .from('user_bookmarks')
          .update({ culture_club_class_id: resolvedId })
          .eq('id', row.id);
        if (updateError) throw new Error(`user_bookmarks(${row.id}) 업데이트 실패: ${updateError.message}`);
      }
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { brand, scanned, matched, orphans };
}

async function main() {
  const client = createAdminClient();
  console.log(`▶ 찜 FK 통합 백필 시작 (dry-run: ${dryRun})`);

  const results = [
    await migrateBrand(client, { brand: 'emart', bookmarkColumn: 'emart_class_id' }),
    await migrateBrand(client, { brand: 'lottemart', bookmarkColumn: 'lottemart_class_id' }),
  ];

  console.log(JSON.stringify(results, null, 2));
  const totalOrphans = results.reduce((sum, r) => sum + r.orphans.length, 0);
  if (totalOrphans > 0) {
    console.error(`⚠️ 매칭 실패(orphan) ${totalOrphans}건 발견 — CHECK 제약/컬럼 정리를 진행하지 마세요.`);
    process.exitCode = 1;
  } else {
    console.log('✅ orphan 0건 — 전부 매칭 성공.');
  }
  return results;
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
