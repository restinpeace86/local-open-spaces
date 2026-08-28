// [NULL 데이터 중분류 매핑 실제 적용](2026-08-28): docs/null-category-analysis.md에서
// "적용 가능"으로 판정한 4개 source_type 매핑을 실제로 반영한다. 대표 지시대로 아래 범위만
// 적용하고 근거가 부족한 나머지는 절대 건드리지 않는다.
//
// - LOCALDATA_PLAYGROUND: facility_type(구조화 필드, 100% 채워짐)이 '야외'/'실내'인 행만
//   각각 '어린이놀이시설(야외)'/'어린이놀이시설(실내)'로 매핑.
// - SWIMMING_POOL: 소스 도메인 자체가 전량 수영장이므로 기존 '수영장'으로 일괄 매핑.
// - LOCALDATA_AMUSEMENT: 이름에 '키즈카페'가 포함된 행만 '키즈카페'로 매핑.
// - GG_EVENTS: 이름에 '바닥분수' 또는 '물놀이'가 포함된 행만 '바닥분수/물놀이시설'로 매핑.
//
// 이 매핑을 category_rules(범용 Dynamic Keyword Rule Engine)에 넣지 않는 이유: 실측 확인
// 결과 '키즈카페'는 LOCALDATA_AMUSEMENT 외에 LOCALDATA_PLAYGROUND에도 541건 우연히
// 포함되어 있었다(키즈카페 안에 설치된 놀이시설이 별도로 등록된 것으로 추정) — 범용 엔진에
// source_type 구분 없이 넣으면 이 541건도 '키즈카페'로 잘못 분류된다(대표 지시 범위 밖).
// '물놀이'도 GG_EVENTS 외 2개 소스에 흩어져 있어 같은 문제가 있다. 이 함수는 source_type을
// 명시적으로 제한해 대표가 승인한 범위만 정확히 적용한다.
import { createAdminClient } from './supabase-admin.mjs';

export const PLAYGROUND_OUTDOOR = '어린이놀이시설(야외)';
export const PLAYGROUND_INDOOR = '어린이놀이시설(실내)';
export const SWIMMING_POOL_CATEGORY = '수영장';
export const KIDS_CAFE = '키즈카페';
export const WATER_PLAY_FACILITY = '바닥분수/물놀이시설';

const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 200;

// facility_type이 '야외'/'실내' 둘 중 하나가 아닌 예상 밖 값이면(현재 실측상 0건이지만)
// 손대지 않는다 — 추측 금지.
function classifyPlayground(row) {
  if (row.facility_type === '야외') return PLAYGROUND_OUTDOOR;
  if (row.facility_type === '실내') return PLAYGROUND_INDOOR;
  return null;
}

function classifySwimmingPool() {
  return SWIMMING_POOL_CATEGORY;
}

function classifyAmusement(row) {
  return row.name?.includes('키즈카페') ? KIDS_CAFE : null;
}

function classifyGgEvents(row) {
  return row.name?.includes('바닥분수') || row.name?.includes('물놀이') ? WATER_PLAY_FACILITY : null;
}

// { sourceType, classify } — classify(row)는 row={id,name,facility_type}를 받아 매핑할
// category_min(string) 또는 매핑 대상이 아니면 null을 반환한다.
const RULES = {
  LOCALDATA_PLAYGROUND: classifyPlayground,
  SWIMMING_POOL: classifySwimmingPool,
  LOCALDATA_AMUSEMENT: classifyAmusement,
  GG_EVENTS: classifyGgEvents,
};

// (source_type + category_min IS NULL) 조합으로 DB에 직접 필터링하면 이 프로젝트에서 이미
// 여러 차례 실측된 것과 같은 플래너 오판(불필요한 조건 조합 시 통계 추정이 어긋나 seq scan을
// 선택)으로 timeout이 났다(실측 확인, 2026-08-28) — category_min IS NULL 단독 조건(이미
// 이 세션에서 안정적으로 동작함을 확인한 패턴)으로 전체를 한 번만 조회한 뒤, source_type별
// 분류는 인메모리에서 수행한다.
async function fetchAllNullRows(client) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = client
      .from('open_spaces')
      .select('id, source_type, name, facility_type')
      .is('category_min', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`open_spaces NULL 행 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function classifyRows(rows) {
  const bySourceType = new Map();
  for (const row of rows) {
    const classify = RULES[row.source_type];
    if (!classify) continue;
    const category = classify(row);
    if (!category) continue;
    if (!bySourceType.has(row.source_type)) bySourceType.set(row.source_type, []);
    bySourceType.get(row.source_type).push({ id: row.id, category });
  }
  return bySourceType;
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
      // eslint-disable-next-line no-await-in-loop
      const { error, count } = await client
        .from('open_spaces')
        .update({ category_min: category, category_min_source: 'RULE' }, { count: 'exact' })
        .in('id', batch)
        .is('category_min', null);
      if (error) throw new Error(`${category} UPDATE 실패: ${error.message}`);
      updated += count ?? batch.length;
    }
  }
  return updated;
}

export async function applyLegacySourceCategoryMapping(client = createAdminClient()) {
  const rows = await fetchAllNullRows(client);
  const bySourceType = classifyRows(rows);

  const breakdown = {};
  let allMatches = [];
  for (const [sourceType, matches] of bySourceType) {
    const counts = {};
    for (const { category } of matches) counts[category] = (counts[category] ?? 0) + 1;
    breakdown[sourceType] = counts;
    allMatches = allMatches.concat(matches);
  }

  const updated = await applyUpdates(client, allMatches);
  return { updated, breakdown };
}
