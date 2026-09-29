// [표준중분류 '기타'/미지정(NULL) 명칭·주소 CSV 내보내기](2026-09-30 사용자
// 지시): "기타(대분류) >> 기타(중분류) 항목을 DB에서 데이터 읽어서 기타.csv로
// 추출해줘. 표준중분류가 미지정(NULL)인것도 미지정.csv로 추출해줘." —
// export-museum-name-address.mjs와 동일한 관례(명칭+주소, 중복 대표만 추출,
// 1,000건 조회 상한 대비 페이지네이션).
//
// [실행 방법] node scripts/export-etc-and-unassigned-category-min.mjs
import { pathToFileURL } from 'url';
import { loadEnv } from './lib/load-env.mjs';
import { createAdminClient } from './ingest/lib/supabase-admin.mjs';
import fs from 'fs';

loadEnv();

function csvField(value) {
  const text = value ?? '';
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const PAGE_SIZE = 1000;

async function fetchAllRows(admin, buildQuery) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(admin).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function writeCsv(filename, rows) {
  const csvLines = ['명칭,주소', ...rows.map((r) => `${csvField(r.display_name ?? r.name ?? '')},${csvField(r.address ?? '')}`)];
  fs.writeFileSync(filename, csvLines.join('\n') + '\n', 'utf8');
  console.log(`[EXPORT_ETC_AND_UNASSIGNED] ${filename}: ${rows.length}건 저장`);
}

export async function run() {
  const admin = createAdminClient();

  const etcRows = await fetchAllRows(admin, (a) =>
    a
      .from('open_spaces')
      .select('id, name, display_name, address')
      .eq('category_min', '기타')
      .or('group_id.is.null,is_dedup_representative.eq.true')
  );
  writeCsv('기타.csv', etcRows);

  const unassignedRows = await fetchAllRows(admin, (a) =>
    a
      .from('open_spaces')
      .select('id, name, display_name, address')
      .is('category_min', null)
      .or('group_id.is.null,is_dedup_representative.eq.true')
  );
  writeCsv('미지정.csv', unassignedRows);

  console.log('[EXPORT_ETC_AND_UNASSIGNED] 완료');
  return { etcCount: etcRows.length, unassignedCount: unassignedRows.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(`❌ [EXPORT_ETC_AND_UNASSIGNED] 실행 실패: ${err.message}`);
    process.exitCode = 1;
  });
}
