// [일정/스케줄 정규화 백필](2026-10-06 todo.md 개선사항 3): 기존 행에는
// schedule_start_date 등이 전부 null이다 — backfill-culture-club-age-range-
// months.mjs와 동일한 패턴(id 커서 페이지네이션, dry-run, Safe Merge).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import {
  normalizeDaysToCodes,
  parseRoundFromTitle,
  parseTotalSessionsFromTitle,
  yyyymmddToIso,
} from './lib/schedule-normalizer.mjs';

loadEnv();

const PAGE_SIZE = 500;

function buildEmartUpdate(row) {
  return {
    schedule_start_date: yyyymmddToIso(row.class_start_date),
    schedule_end_date: yyyymmddToIso(row.class_end_date),
    schedule_days_code: normalizeDaysToCodes(row.class_day),
    round: parseRoundFromTitle(row.class_title),
    total_sessions: parseTotalSessionsFromTitle(row.class_title),
  };
}

function buildLottemartUpdate(row) {
  return {
    schedule_start_date: yyyymmddToIso(row.class_start_date),
    schedule_end_date: null,
    schedule_days_code: normalizeDaysToCodes(row.class_day),
    round: null,
    total_sessions: row.session_count ?? null,
  };
}

const TABLE_CONFIGS = [
  {
    table: 'emart_culture_club_classes',
    selectColumns: 'id, class_title, class_day, class_start_date, class_end_date',
    buildUpdate: buildEmartUpdate,
  },
  {
    table: 'lottemart_culture_club_classes',
    selectColumns: 'id, class_day, class_start_date, session_count',
    buildUpdate: buildLottemartUpdate,
  },
];

async function backfillTable(client, { table, selectColumns, buildUpdate }, { dryRun }) {
  if (dryRun) {
    const { count } = await client.from(table).select('*', { count: 'exact', head: true }).is('schedule_start_date', null);
    return { table, candidateCount: count };
  }

  let lastId = null;
  let scanned = 0;
  let fixed = 0;
  let stillNull = 0;

  for (;;) {
    let query = client
      .from(table)
      .select(selectColumns)
      .is('schedule_start_date', null)
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
      if (update.schedule_start_date == null) {
        stillNull += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const { error: updateError } = await client
        .from(table)
        .update(update)
        .eq('id', row.id)
        .is('schedule_start_date', null); // Safe Merge
      if (updateError) throw new Error(`${table}(${row.id}) 업데이트 실패: ${updateError.message}`);
      fixed += 1;
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { table, scanned, fixed, stillNull };
}

export async function backfillCultureClubScheduleNormalized({ dryRun = false } = {}) {
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
  backfillCultureClubScheduleNormalized({ dryRun })
    .then((results) => {
      console.log(dryRun ? 'dry-run: 실제 UPDATE 없이 대상 건수만 집계합니다.' : '실제 UPDATE 완료.');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
