// [네이버 플레이스 ID DB 반영](2026-10-17 사용자 지시): "유아숲체험원.csv 여기에
// 네이버플레이스 ID 있는거 이제 DB에 집어넣어줘." CSV에서 매칭이 확정된(숫자
// ID) 행만 open_spaces.naver_place_id에 반영한다 — NOT_FOUND/빈 값 행은
// 손대지 않는다(이번 요청 범위 밖, 추측 금지).
//
// [CSV ↔ DB 매칭 키] CSV에는 open_spaces.id가 없다(export-restaurants.mjs와
// 동일한 4컬럼 포맷을 그대로 따름). 매칭 과정에서 주소(주소 컬럼)는 이름이
// 정확히 같을 때 네이버 쪽으로 보정될 수 있어(search-and-match.mjs) 신뢰할
// 수 있는 키가 아니다 — 대신 명칭+위도+경도(내 스크립트들이 절대 건드리지
// 않은 3개 컬럼)로 DB 행을 다시 조회해 매칭한다. 이 3개가 전부 같은 행이
// 둘 이상이면(사실상 불가능 — 좌표가 소수점 9자리까지 같아야 함) 근거
// 불충분으로 건너뛴다(추측 금지).
import path from 'path';
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { readCsvUtf8 } from './lib/csv.mjs';

loadEnv();

const { createAdminClient } = await import('../ingest/lib/supabase-admin.mjs');

const CSV_PATH = path.resolve(process.cwd(), 'metadata', '유아숲체험원.csv');
const CATEGORY_MIN = '유아숲체험원';
const PAGE_SIZE = 1000;
const SAFETY_MAX_PAGES = 50;

async function fetchCurrentDbRows(client, categoryMin) {
  const allRows = [];
  for (let page = 0; page < SAFETY_MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .rpc('get_open_spaces_by_category_min', { p_category_min: categoryMin })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`get_open_spaces_by_category_min 호출 실패: ${error.message}`);

    const rows = data ?? [];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return allRows;
}

function buildMatchKey(name, lat, lng) {
  return `${name}|${lat}|${lng}`;
}

export async function run({ csvPath = CSV_PATH, categoryMin = CATEGORY_MIN } = {}) {
  const client = createAdminClient();
  const dbRows = await fetchCurrentDbRows(client, categoryMin);

  // 같은 키를 가진 DB 행이 둘 이상이면(이론상 거의 불가능) 매칭 근거가
  // 불충분해지므로, 아예 매칭 후보에서 뺀다(추측 금지).
  const dbByKey = new Map();
  const ambiguousKeys = new Set();
  for (const row of dbRows) {
    const key = buildMatchKey(row.name, row.lat, row.lng);
    if (dbByKey.has(key)) {
      ambiguousKeys.add(key);
    } else {
      dbByKey.set(key, row.id);
    }
  }
  for (const key of ambiguousKeys) dbByKey.delete(key);

  const csvRows = readCsvUtf8(csvPath);
  const stats = { totalCsvRows: csvRows.length, withNaverId: 0, updated: 0, unmatched: 0, failed: 0 };
  const unmatchedNames = [];
  const failedNames = [];

  for (const row of csvRows) {
    const naverId = row.네이버플레이스ID?.trim();
    if (!naverId || !/^\d+$/.test(naverId)) continue;
    stats.withNaverId += 1;

    const key = buildMatchKey(row.명칭, row.위도, row.경도);
    const dbId = dbByKey.get(key);
    if (!dbId) {
      stats.unmatched += 1;
      unmatchedNames.push(row.명칭);
      continue;
    }

    const { error } = await client.from('open_spaces').update({ naver_place_id: naverId }).eq('id', dbId);
    if (error) {
      stats.failed += 1;
      failedNames.push(`${row.명칭}: ${error.message}`);
      continue;
    }
    stats.updated += 1;
  }

  return { ...stats, unmatchedNames, failedNames };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const csvPathArg = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : CSV_PATH;
  run({ csvPath: csvPathArg })
    .then((stats) => {
      console.log(`✅ naver_place_id DB 반영 완료:`, stats);
    })
    .catch((err) => {
      console.error('❌ naver_place_id DB 반영 실패:', err.message);
      process.exit(1);
    });
}
