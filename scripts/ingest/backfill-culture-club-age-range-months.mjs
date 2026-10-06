// [연령 표기 → 개월 수 정규화 백필](2026-10-06 todo.md 개선사항 2): 이미
// 수집된 기존 행에는 min_age_months/max_age_months가 전부 null이다 — 신규
// ingest에만 parseAgeRangeToMonths()를 연결하는 것으로는 과거 데이터가
// 채워지지 않는다. backfill-seoul-yeyak-is-free.mjs와 동일한 패턴(id 커서
// 페이지네이션, dry-run, Safe Merge — 이미 값이 있는 행은 건드리지 않음).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { parseAgeRangeToMonths } from './lib/age-range-parser.mjs';

loadEnv();

const PAGE_SIZE = 500;

// config: { table, idColumn, sourceColumn }
// - 이마트: class_title 자체에 연령이 박혀 있다(별도 연령 필드 없음).
// - 롯데마트: age_range_text가 전용 원문 필드다.
const TABLE_CONFIGS = [
  { table: 'emart_culture_club_classes', sourceColumn: 'class_title' },
  { table: 'lottemart_culture_club_classes', sourceColumn: 'age_range_text' },
];

async function backfillTable(client, { table, sourceColumn }, { dryRun }) {
  if (dryRun) {
    const { count } = await client
      .from(table)
      .select('*', { count: 'exact', head: true })
      .is('min_age_months', null)
      .is('max_age_months', null);
    return { table, candidateCount: count };
  }

  let lastId = null;
  let scanned = 0;
  let fixed = 0;
  let stillNull = 0;

  for (;;) {
    let query = client
      .from(table)
      .select(`id, ${sourceColumn}`)
      .is('min_age_months', null)
      .is('max_age_months', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`${table} 스캔 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;

    for (const row of data) {
      const { minAgeMonths, maxAgeMonths } = parseAgeRangeToMonths(row[sourceColumn]);
      if (minAgeMonths == null && maxAgeMonths == null) {
        stillNull += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const { error: updateError } = await client
        .from(table)
        .update({ min_age_months: minAgeMonths, max_age_months: maxAgeMonths })
        .eq('id', row.id)
        .is('min_age_months', null)
        .is('max_age_months', null); // Safe Merge
      if (updateError) throw new Error(`${table}(${row.id}) 업데이트 실패: ${updateError.message}`);
      fixed += 1;
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { table, scanned, fixed, stillNull };
}

export async function backfillCultureClubAgeRangeMonths({ dryRun = false } = {}) {
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
  backfillCultureClubAgeRangeMonths({ dryRun })
    .then((results) => {
      console.log(dryRun ? 'dry-run: 실제 UPDATE 없이 대상 건수만 집계합니다.' : '실제 UPDATE 완료.');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
