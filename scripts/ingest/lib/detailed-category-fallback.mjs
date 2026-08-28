// [open_spaces 세부 중분류 매핑](2026-08-28): docs/open-spaces-detailed-category-mapping-
// dryrun-report.md 3절 설계 그대로 구현한다. category_rules(범용 Dynamic Keyword Rule
// Engine)로 먼저 구체적인 키워드 매칭을 시도한 뒤에도 여전히 category_min이 NULL인 행 중,
// 이 taxonomy의 데이터 도메인에 해당하는 8개 source_type에 한해서만 '기타'로 채운다.
//
// '기타'를 category_rules 테이블에 빈 문자열 키워드로 넣지 않는 이유: category_rules는
// daily/monthly 배치가 공유하는 범용 엔진(applyCategoryRules())이 source_type 구분 없이
// 전체 open_spaces에 적용한다 — 그렇게 하면 이 taxonomy와 무관한 LOCALDATA_PLAYGROUND 등
// 소스에도 '기타'가 무차별 적용된다. 이 함수는 그 대신 source_type을 명시적으로 제한해
// 안전하게 동작한다.
import { createAdminClient } from './supabase-admin.mjs';

// docs/open-spaces-detailed-category-mapping-dryrun-report.md 1절 — 이 taxonomy의 데이터
// 도메인에 해당하는 source_type만. 나머지(LOCALDATA_PLAYGROUND/LOCALDATA_AMUSEMENT/
// SWIMMING_POOL/GG_EVENTS)는 name이 호스트 건물명이라 이 taxonomy와 무관함을 실측 확인했다.
export const ELIGIBLE_SOURCE_TYPES = [
  'KOR_TOUR_API_V4',
  'CULTURAL_FACILITY_SUMMARY',
  'CULTURE_FACILITY',
  'PUBLIC_FACILITY_OPEN',
  'GO_CAMPING',
  'NATIONAL_PARK_ECOTOUR',
  'CITY_PARK',
  'PARK_API',
];

const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 200;

// 이 taxonomy를 대표하는 category_min 규칙이 실제로 category_rules에 반영된 뒤(이 함수는
// 그 규칙 적용이 끝난 다음에 호출되는 것을 전제한다 — run-daily.mjs/run-monthly.mjs에서
// CATEGORY_RULES_APPLICATION 다음 순서로 배치했다) 여전히 category_min이 NULL인 대상만
// '기타'로 채운다. 이미 채워진 행은 절대 건드리지 않는다(덮어쓰기 없음).
export async function applyDetailedCategoryFallback(client = createAdminClient()) {
  let lastId = null;
  let scanned = 0;
  let updated = 0;

  for (;;) {
    let query = client
      .from('open_spaces')
      .select('id')
      .is('category_min', null)
      .in('source_type', ELIGIBLE_SOURCE_TYPES)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`open_spaces 기타 폴백 대상 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;
    const ids = data.map((r) => r.id);
    for (let i = 0; i < ids.length; i += UPDATE_BATCH_SIZE) {
      const batch = ids.slice(i, i + UPDATE_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop
      const { error: updateError, count } = await client
        .from('open_spaces')
        .update({ category_min: '기타', category_min_source: 'RULE' }, { count: 'exact' })
        .in('id', batch)
        .is('category_min', null);
      if (updateError) throw new Error(`open_spaces 기타 폴백 UPDATE 실패: ${updateError.message}`);
      updated += count ?? batch.length;
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { scanned, updated };
}
