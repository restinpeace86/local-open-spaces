// [상태/강사명 정규화 백필](2026-10-06 todo.md 개선사항 5): 기존 행에는
// normalized_status(및 이마트의 instructor_name)가 전부 null이다 —
// backfill-culture-club-age-range-months.mjs와 동일한 패턴.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { normalizeEmartStatus, normalizeLottemartStatus, parseInstructorFromTitle } from './lib/culture-club-common.mjs';

loadEnv();

const PAGE_SIZE = 500;

const TABLE_CONFIGS = [
  {
    table: 'emart_culture_club_classes',
    selectColumns: 'id, class_title, filter_status',
    buildUpdate: (row) => ({
      normalized_status: normalizeEmartStatus(row.filter_status),
      instructor_name: parseInstructorFromTitle(row.class_title),
    }),
  },
  {
    table: 'lottemart_culture_club_classes',
    selectColumns: 'id, registration_status',
    buildUpdate: (row) => ({ normalized_status: normalizeLottemartStatus(row.registration_status) }),
  },
];

async function backfillTable(client, { table, selectColumns, buildUpdate }, { dryRun }) {
  if (dryRun) {
    const { count } = await client.from(table).select('*', { count: 'exact', head: true }).is('normalized_status', null);
    return { table, candidateCount: count };
  }

  let lastId = null;
  let scanned = 0;
  let fixed = 0;

  for (;;) {
    let query = client
      .from(table)
      .select(selectColumns)
      .is('normalized_status', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`${table} 스캔 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;

    for (const row of data) {
      const update = buildUpdate(row);
      // eslint-disable-next-line no-await-in-loop
      const { error: updateError } = await client.from(table).update(update).eq('id', row.id).is('normalized_status', null); // Safe Merge
      if (updateError) throw new Error(`${table}(${row.id}) 업데이트 실패: ${updateError.message}`);
      fixed += 1;
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { table, scanned, fixed };
}

export async function backfillCultureClubStatusInstructorNormalized({ dryRun = false } = {}) {
  const client = createAdminClient();
  const results = [];
  for (const config of TABLE_CONFIGS) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await backfillTable(client, config, { dryRun }));
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  backfillCultureClubStatusInstructorNormalized({ dryRun })
    .then((results) => {
      console.log(dryRun ? 'dry-run: 실제 UPDATE 없이 대상 건수만 집계합니다.' : '실제 UPDATE 완료.');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
