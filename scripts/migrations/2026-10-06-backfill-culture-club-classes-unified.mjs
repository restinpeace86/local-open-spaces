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

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const PAGE_SIZE = 500;
const UPSERT_CHUNK_SIZE = 500;

function toEmartRow(row) {
  return {
    brand: 'emart',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    main_category_name: row.main_category_name,
    sub_category_name: row.sub_category_name,
    classroom: row.classroom,
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    class_original_fee: row.class_original_fee,
    class_fee: row.class_fee,
    class_material_fee: row.class_material_fee,
    instructor_name: row.instructor_name,
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: row.round,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.filter_status,
    register_start_at: row.register_start_at,
    is_excluded: row.is_excluded,
    raw_extra: {
      main_category_code: row.main_category_code,
      sub_category_code: row.sub_category_code,
      store_center: row.store_center,
      min_class_capacity: row.min_class_capacity,
      class_capacity: row.class_capacity,
      semester_year: row.semester_year,
      semester: row.semester,
      class_type: row.class_type,
      occupied_full_flag: row.occupied_full_flag,
      channel_online: row.channel_online,
      channel_offline: row.channel_offline,
      register_start_date: row.register_start_date,
      register_end_date: row.register_end_date,
      class_start_date: row.class_start_date,
      class_end_date: row.class_end_date,
      class_closed_date: row.class_closed_date,
      class_detail_title: row.class_detail_title,
      class_detail_content: row.class_detail_content,
      main_image_bucket: row.main_image_bucket,
      main_image_region: row.main_image_region,
      main_image_key: row.main_image_key,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toLottemartRow(row) {
  return {
    brand: 'lottemart',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    main_category_name: row.main_category_name,
    sub_category_name: row.sub_category_name,
    classroom: row.classroom,
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    class_original_fee: row.class_original_fee,
    class_fee: row.class_fee,
    class_material_fee: row.class_material_fee,
    instructor_name: row.instructor_name,
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: row.round,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.registration_status,
    register_start_at: null, // 롯데마트는 이 개념 자체가 없다(실측 확인)
    is_excluded: row.is_excluded,
    raw_extra: {
      age_range_text: row.age_range_text,
      session_count: row.session_count,
      discount_badge_text: row.discount_badge_text,
      is_closing_soon: row.is_closing_soon,
      is_new: row.is_new,
      like_count: row.like_count,
      semester_code: row.semester_code,
      target_code: row.target_code,
      target_name: row.target_name,
      class_code: row.class_code,
      class_intro: row.class_intro,
      class_tip: row.class_tip,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

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
  results.push(await copyTable(client, { table: 'emart_culture_club_classes', mapFn: toEmartRow, label: 'emart' }));
  results.push(await copyTable(client, { table: 'lottemart_culture_club_classes', mapFn: toLottemartRow, label: 'lottemart' }));

  console.log(JSON.stringify(results, null, 2));
  return results;
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
