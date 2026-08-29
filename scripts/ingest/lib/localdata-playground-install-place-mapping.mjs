// [행안부 놀이시설 설치장소코드 매핑 백필](2026-08-29 사용자 지시): playground-adapter.mjs의
// transform()이 신규/NULL 행에는 instlPlaceCd 기준 category_min을 정확히 매기지만,
// upsertRowsSafeMerge()의 COALESCE 안전 병합(기존 값이 있으면 새 값을 절대 덮어쓰지 않음)
// 때문에 이미 다른 값(대개 category_rules.mjs의 범용 키워드 RULE 매칭 결과)이 채워진
// 기존 행에는 새 매핑이 전혀 반영되지 않는 것을 실측으로 확인했다(A092/A093: 각각 143/49건
// 전량 반영 안 됨). 대표 승인 하에, 이 8개 설치장소코드에 한해서는 기존 category_min 값과
// 무관하게 명시적으로 덮어쓴다 — 소스 자체의 구조화된 분류(instlPlaceCd)가 범용 키워드
// 추측(RULE)보다 신뢰도가 높다는 게 이번 지시의 취지이기 때문이다. legacy-source-category-
// mapping.mjs(NULL 행만 채움)와 달리 이 스크립트는 의도적으로 기존 값도 덮어쓴다 — 범위를
// LOCALDATA_PLAYGROUND 소스 + 이 8개 코드로만 엄격히 제한해 다른 매핑에는 영향이 없다.
import { createAdminClient } from './supabase-admin.mjs';

// scripts/ingest/adapters/playground-adapter.mjs의 INSTALL_PLACE_CODE_TO_CATEGORY_MIN과
// 반드시 동일하게 유지한다(어댑터는 신규 upsert 시, 이 스크립트는 기존 행 백필 시 사용).
export const INSTALL_PLACE_CODE_TO_CATEGORY_MIN = {
  A003: '공원',
  A013: '키즈카페',
  A022: '종합/기타박물관',
  A030: '자연휴양림',
  A032: '캠핑장',
  A033: '도서관',
  A092: '육아종합지원센터',
  A093: '유아교육진흥원',
};

const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 200;
const SOURCE_TYPE = 'LOCALDATA_PLAYGROUND';

// source_type='LOCALDATA_PLAYGROUND' 행만 조회한다(범위 제한) — id 기준 keyset
// pagination으로 전량을 안정적으로 순회한다(legacy-source-category-mapping.mjs와 동일한
// 이유: category_min 조건까지 얹으면 플래너 오판으로 timeout 재현 이력이 있어 단일 조건만
// 쓴다).
async function fetchAllPlaygroundRows(client) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = client
      .from('open_spaces')
      .select('id, category_min, raw_data')
      .eq('source_type', SOURCE_TYPE)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`open_spaces(LOCALDATA_PLAYGROUND) 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function classifyRows(rows) {
  const matches = [];
  for (const row of rows) {
    const instlPlaceCd = row.raw_data?.instlPlaceCd;
    const targetCategory = INSTALL_PLACE_CODE_TO_CATEGORY_MIN[instlPlaceCd];
    if (!targetCategory) continue;
    // 이미 같은 값이면 UPDATE 대상에서 제외(불필요한 쓰기 최소화).
    if (row.category_min === targetCategory) continue;
    matches.push({ id: row.id, category: targetCategory });
  }
  return matches;
}

async function applyUpdates(client, matches) {
  const byCategory = new Map();
  for (const { id, category } of matches) {
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(id);
  }

  let updated = 0;
  for (const [category, ids] of byCategory) {
    for (let i = 0; i < ids.length; i += UPDATE_BATCH_SIZE) {
      const batch = ids.slice(i, i + UPDATE_BATCH_SIZE);
      // 의도적으로 .is('category_min', null) 조건을 걸지 않는다 — 기존 값(대개 RULE
      // 키워드 매칭 결과)을 이 8개 설치장소코드에 한해 명시적으로 덮어쓰는 것이 이번
      // 작업의 목적이다.
      // eslint-disable-next-line no-await-in-loop
      const { error, count } = await client
        .from('open_spaces')
        .update({ category_min: category, category_min_source: 'RAW' }, { count: 'exact' })
        .in('id', batch);
      if (error) throw new Error(`${category} UPDATE 실패: ${error.message}`);
      updated += count ?? batch.length;
    }
  }
  return updated;
}

export async function applyPlaygroundInstallPlaceCategoryMapping(client = createAdminClient()) {
  const rows = await fetchAllPlaygroundRows(client);
  const matches = classifyRows(rows);

  const breakdown = {};
  for (const { category } of matches) breakdown[category] = (breakdown[category] ?? 0) + 1;

  const updated = await applyUpdates(client, matches);
  return { scanned: rows.length, updated, breakdown };
}
