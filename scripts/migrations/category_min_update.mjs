// implementation/todo.md "[1단계 중분류(Category Min) 본 데이터 UPDATE 마이그레이션 실행]"
// 실제 UPDATE 실행 스크립트. docs/category-mid-rawfield-dryrun-report.md(Dry-run) 6절 대표
// 승인 요청 사항에 대한 대표 승인 완료(3건, implementation/todo.md 기재)를 실제 DB에 반영한다.
//
// 대상: public.events의 is_active = true 이면서 category_min IS NULL인 행만 (기존 RAW/RULE/
// MANUAL로 이미 채워진 행은 절대 덮어쓰지 않음 — .is('category_min', null) 가드 유지).
//
// 승인 3건:
// 1. seoul_public_reservation: raw_data.MINCLASSNM 0순위 RAW 재적용
//    (scripts/migrations/2026-08-26-category-rules-engine.sql 4절에서 이미 승인·구현된 규칙의
//    재현 — 이후 신규 수집된 행에는 아직 적용되지 않아 재실행 필요함을 Dry-run으로 확인함).
// 2. seoul_public_culture: raw_data.CODENAME → 표준 중분류 제안 매핑 확정 반영
//    (docs/category-mid-rawfield-dryrun-report.md 3절 매핑표 그대로, '기타'는 매핑하지 않고
//    NULL 유지).
// 3. gg_public / tourapi_4.0: 매핑 보류 확정 — 이번 실행에서 변경하지 않음(NULL 유지, 잔여
//    건수만 확인 로그로 남김).
//
// 재실행해도 안전(멱등) — 이미 category_min이 채워진 행은 .is('category_min', null) 가드로
// 스캔·UPDATE 대상에서 제외된다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 200;

// docs/category-mid-rawfield-dryrun-report.md 3절 "제안 매핑(초안)" 그대로 — 대표 승인 완료.
const CODENAME_TO_CATEGORY_MIN = {
  연극: '문화행사',
  무용: '문화행사',
  국악: '문화행사',
  클래식: '문화행사',
  콘서트: '문화행사',
  '뮤지컬/오페라': '문화행사',
  '독주/독창회': '문화행사',
  영화: '문화행사',
  '축제-문화/예술': '지역축제/페스티벌',
  '축제-기타': '지역축제/페스티벌',
  '축제-전통/역사': '지역축제/페스티벌',
  '축제-시민화합': '지역축제/페스티벌',
  '축제-자연/경관': '지역축제/페스티벌',
  '축제-관광/체육': '지역축제/페스티벌',
  '전시/미술': '전시/관람',
  '교육/체험': '교육체험',
  // '기타'는 의미가 없어 매핑하지 않는다(그대로 NULL 유지 원칙 준수).
};

async function scanNullCategoryMinBySource(supabase, source) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = supabase
      .from('events')
      .select('id, raw_data')
      .eq('is_active', true)
      .eq('source', source)
      .is('category_min', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw new Error(`events(${source}) 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function applyUpdates(supabase, updates) {
  for (let i = 0; i < updates.length; i += UPDATE_BATCH_SIZE) {
    const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((u) =>
        supabase
          .from('events')
          .update({ category_min: u.category_min, category_min_source: 'RAW' })
          .eq('id', u.id)
          .is('category_min', null)
      )
    );
    for (const r of results) {
      if (r.error) throw new Error(`UPDATE 실패: ${r.error.message}`);
    }
  }
  return updates.length;
}

async function countNullBySource(supabase, source) {
  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('source', source)
    .is('category_min', null);
  if (error) throw new Error(`${source} NULL count 실패: ${error.message}`);
  return count ?? 0;
}

async function run() {
  const supabase = createAdminClient();

  console.log('▶ [승인 1] seoul_public_reservation: MINCLASSNM 0순위 RAW 재적용...');
  const reservationRows = await scanNullCategoryMinBySource(supabase, 'seoul_public_reservation');
  const reservationUpdates = reservationRows
    .filter((row) => row.raw_data?.MINCLASSNM)
    .map((row) => ({ id: row.id, category_min: row.raw_data.MINCLASSNM }));
  const reservationUpdated = await applyUpdates(supabase, reservationUpdates);
  console.log(
    `  스캔: ${reservationRows.length}건, 반영: ${reservationUpdated}건, MINCLASSNM 없음(NULL 유지): ${reservationRows.length - reservationUpdated}건`
  );

  console.log('\n▶ [승인 2] seoul_public_culture: CODENAME 제안 매핑 확정 반영...');
  const cultureRows = await scanNullCategoryMinBySource(supabase, 'seoul_public_culture');
  const cultureUpdates = [];
  for (const row of cultureRows) {
    const mapped = CODENAME_TO_CATEGORY_MIN[row.raw_data?.CODENAME];
    if (mapped) cultureUpdates.push({ id: row.id, category_min: mapped });
  }
  const cultureUpdated = await applyUpdates(supabase, cultureUpdates);
  console.log(
    `  스캔: ${cultureRows.length}건, 반영: ${cultureUpdated}건, 매핑 불가(NULL 유지): ${cultureRows.length - cultureUpdated}건`
  );

  console.log('\n▶ [승인 3] gg_public / tourapi_4.0: 매핑 보류 확정 — 변경하지 않음...');
  const [ggNull, tourNull] = await Promise.all([
    countNullBySource(supabase, 'gg_public'),
    countNullBySource(supabase, 'tourapi_4.0'),
  ]);
  console.log(`  gg_public NULL 잔여: ${ggNull}건, tourapi_4.0 NULL 잔여: ${tourNull}건 (변경 없음)`);

  console.log('\n=== 종합 ===');
  console.log(`총 UPDATE 반영: ${reservationUpdated + cultureUpdated}건`);
}

run().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
