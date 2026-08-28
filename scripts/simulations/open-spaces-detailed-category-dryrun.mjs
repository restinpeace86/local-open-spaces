// [open_spaces 세부 중분류 매핑 시뮬레이션](2026-08-28): 읽기 전용 Dry-run. DB에 어떠한
// UPDATE도 하지 않는다. category_min이 현재 NULL인 open_spaces 행에 아래 초안 키워드
// 규칙을 인메모리로만 적용해, 신규 세부 중분류 20종 + '기타' 각각에 몇 건이 떨어지는지
// 집계한다. 이미 category_min이 채워진 행(어린이놀이터/공원/체육관 등 49종)은 건드리지
// 않는다(기존 규칙과의 충돌 방지 — 이 스크립트는 애초에 NULL 행만 스캔한다).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

// 우선순위 = 배열 순서(위에서부터 먼저 매칭 시도). 마지막 '기타'는 keyword=''로 항상 매칭되는
// catch-all이다(실제 category_rules 테이블에 반영할 때도 동일한 빈 문자열 include 키워드로
// 표현 가능 — text.includes('')는 항상 true).
export const DRAFT_RULES = [
  { category: '도서관', include: ['도서관'], exclude: ['독서실'] },
  { category: '미술관', include: ['미술관', '아트뮤지엄', '화랑', '갤러리'], exclude: [] },
  { category: '과학관', include: ['과학관', '천문대', '플라네타리움', '지질박물관', '자연사박물관'], exclude: [] },
  { category: '역사박물관', include: ['역사박물관', '민속박물관', '기념관', '전쟁기념관', '독립기념관'], exclude: [] },
  { category: '종합/기타박물관', include: ['박물관', '뮤지엄'], exclude: [] },
  { category: '전시실', include: ['전시장', '전시관', '전시홀'], exclude: [] },
  { category: '공연장', include: ['씨어터', '극장', '콘서트홀', '아트홀', '공연예술센터'], exclude: [] },
  { category: '문화원', include: ['문화원'], exclude: [] },
  { category: '문화의집', include: ['문화의집', '문화의 집', '생활문화센터', '주민문화센터'], exclude: [] },
  { category: '시민교육센터', include: ['평생학습관', '평생교육원', '시민대학', '인재개발원', '50플러스'], exclude: [] },
  { category: '체험학습장', include: ['체험학습장', '농촌체험', '농어촌체험', '팜스테이', '관광농원', '체험농장'], exclude: [] },
  { category: '역사유적지', include: ['유적지', '고궁', '궁궐', '서원', '향교', '산성', '읍성', '사지'], exclude: [] },
  { category: '관광명소', include: ['관광명소', '테마파크', '전망대', '랜드마크'], exclude: [] },
  { category: '생태공원', include: ['생태공원', '습지', '철새도래지', '자연생태'], exclude: [] },
  { category: '수목원', include: ['수목원', '식물원'], exclude: [] },
  { category: '자연휴양림', include: ['자연휴양림', '휴양림', '산림욕장', '치유의숲', '치유의 숲'], exclude: [] },
  { category: '기타', include: [''], exclude: [] },
];

function matches(text, rule) {
  if (!text) return false;
  const hit = rule.include.some((kw) => text.includes(kw));
  if (!hit) return false;
  return !rule.exclude.some((kw) => text.includes(kw));
}

export function classify(name, rules = DRAFT_RULES) {
  for (const rule of rules) {
    if (matches(name, rule)) return rule.category;
  }
  return null;
}

// 1차 시뮬레이션에서 LOCALDATA_PLAYGROUND/LOCALDATA_AMUSEMENT/SWIMMING_POOL/GG_EVENTS
// 소스가 새 taxonomy 키워드에 소수(약 1.8%) 오탐되는 것을 실측 확인했다 — 이 소스들은
// "놀이시설/유원시설/수영장/아파트 부대시설" 등 name이 호스트 건물명(아파트 단지명 등)인
// 경우가 많아, "수목원호정포레스트" 같은 아파트 브랜드명이 "수목원"으로 오매칭되는 식이다.
// 이 taxonomy(박물관/공연장/공원/자연 등)는 애초에 이 4개 소스의 데이터 도메인과 무관하므로,
// 추측으로 우연히 맞는 걸 골라내려 하지 않고 이 소스들은 이번 세부 중분류 매핑 대상에서
// 완전히 제외한다(그대로 NULL 유지 — 이 taxonomy의 '기타'로도 넣지 않는다. '기타'는 "이
// taxonomy의 대상이지만 어디에도 안 맞는" 데이터를 위한 것이지, "애초에 대상이 아닌" 데이터를
// 위한 것이 아니다).
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

async function main() {
  const client = createAdminClient();
  const PAGE_SIZE = 1000;
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = client
      .from('open_spaces')
      .select('id, source_type, name')
      .is('category_min', null)
      .in('source_type', ELIGIBLE_SOURCE_TYPES)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    lastId = data[data.length - 1].id;
  }

  console.log('category_min NULL 중 대상 source_type(8종)만:', rows.length);

  const counts = new Map();
  const samplesByCategory = new Map();
  const bySourceTypeForEtc = new Map();
  const sourceTypeByCategory = new Map();

  for (const row of rows) {
    const category = classify(row.name);
    counts.set(category, (counts.get(category) ?? 0) + 1);
    if (!samplesByCategory.has(category)) samplesByCategory.set(category, []);
    if (samplesByCategory.get(category).length < 10) samplesByCategory.get(category).push(row.name);

    if (!sourceTypeByCategory.has(category)) sourceTypeByCategory.set(category, new Map());
    const stMap = sourceTypeByCategory.get(category);
    stMap.set(row.source_type, (stMap.get(row.source_type) ?? 0) + 1);

    if (category === '기타') {
      bySourceTypeForEtc.set(row.source_type, (bySourceTypeForEtc.get(row.source_type) ?? 0) + 1);
    }
  }

  console.log('\n=== 중분류별 source_type 분포(매칭된 것 중 예상 밖 출처 확인용) ===');
  for (const [category, stMap] of sourceTypeByCategory.entries()) {
    if (category === '기타') continue;
    console.log(`${category}:`, [...stMap.entries()].sort((a, b) => b[1] - a[1]));
  }

  console.log('\n=== 중분류별 매핑 건수 ===');
  console.log([...counts.entries()].sort((a, b) => b[1] - a[1]));

  console.log('\n=== 중분류별 샘플(각 최대 10개) ===');
  for (const [category, samples] of counts.entries()) {
    if (category === '기타') continue;
    console.log(`\n--- ${category} (${counts.get(category)}건) ---`);
    console.log(samplesByCategory.get(category));
  }

  console.log('\n=== 기타로 떨어진 행의 source_type별 분포 ===');
  console.log([...bySourceTypeForEtc.entries()].sort((a, b) => b[1] - a[1]));

  console.log('\n=== 기타 샘플(최대 20개) ===');
  console.log(samplesByCategory.get('기타'));
}

if (process.argv[1] && process.argv[1].endsWith('open-spaces-detailed-category-dryrun.mjs')) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  });
}
