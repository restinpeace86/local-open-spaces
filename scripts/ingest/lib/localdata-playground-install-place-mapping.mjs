// [행안부 놀이시설 설치장소코드 매핑 백필](2026-08-29 사용자 지시): playground-adapter.mjs의
// transform()이 신규/NULL 행에는 instlPlaceCd 기준 category_min을 정확히 매기지만,
// upsertRowsSafeMerge()의 COALESCE 안전 병합(기존 값이 있으면 새 값을 절대 덮어쓰지 않음)
// 때문에 이미 다른 값(대개 category_rules.mjs의 범용 키워드 RULE 매칭 결과)이 채워진
// 기존 행에는 새 매핑이 전혀 반영되지 않는 것을 실측으로 확인했다(A092/A093: 각각 143/49건
// 전량 반영 안 됨). 대표 승인 하에, 이 8개 설치장소코드에 한해서는 기존 category_min 값과
// 무관하게 명시적으로 덮어쓴다 — 소스 자체의 구조화된 분류(instlPlaceCd)가 범용 키워드
// 추측(RULE)보다 신뢰도가 높다는 게 이번 지시의 취지이기 때문이다. legacy-source-category-
// mapping.mjs(NULL 행만 채움)와 달리 이 스크립트는 의도적으로 기존 값도 덮어쓴다 — 범위를
// LOCALDATA_PLAYGROUND 소스 + 이 코드들로만 엄격히 제한해 다른 매핑에는 영향이 없다.
//
// [개선사항3 - 설치장소코드 표준 중분류 전면 정비](todo.md, 2026-09-09 사용자 지시): "공공데이터
// 원천소스(localdata_playground) API(getPfctInfo3)의 설치장소 코드를 기준으로.. 흩어진
// 데이터를 일괄 이관하는 일회성 마이그레이션" — 대표 확인 사항 두 가지를 반영해 나머지
// 14개 코드(A001/A002/A004~A012/A020/A023/A031)를 추가한다.
// 1) "표준 중분류"는 이 파일이 이미 쓰던 category_min(내부 표준 분류)을 가리킨다(노출
//    중분류/service_categories가 아님 — 그쪽은 아직 이 코드들에 해당하는 항목이 없고,
//    확대하면 곧바로 지도에 새로 노출되어 "공개 범위 변경"이 되므로 이번 범위가 아니다).
// 2) "이미 수작업/큐레이션을 거쳐서 고정된 데이터는 절대 덮어쓰지 말라"는 원칙은 이 소스
//    (LOCALDATA_PLAYGROUND) 안에서는 오직 category_min='놀이방식당'(A004의 식당 중
//    사람이 직접 확인해 고정한 값)에만 해당한다고 대표가 명시적으로 확인했다 — 실측으로
//    발견된 다른 값들(예: A010/주택단지의 "어린이놀이터" 39,230건, RULE 자동분류)은
//    이 소스 맥락에서는 의미를 갖지 않는다고 판단해 그대로 덮어쓰기 대상에 포함한다
//    (classifyRows의 PRESERVED_CATEGORY_MIN 참고).
export const INSTALL_PLACE_CODE_TO_CATEGORY_MIN = {
  A001: '목욕장업소',
  A002: '도로휴게시설',
  A003: '공원',
  A004: '식품접객업소',
  A005: '아동복지시설',
  A006: '어린이집',
  A007: '유치원',
  A008: '대규모점포',
  A009: '의료기관',
  A010: '주택단지',
  A011: '학교',
  A012: '학원',
  A013: '키즈카페',
  A020: '주상복합',
  A022: '종합/기타박물관',
  A023: '종교시설',
  A030: '자연휴양림',
  A031: '하천',
  A032: '캠핑장',
  A033: '도서관',
  A092: '육아종합지원센터',
  A093: '유아교육진흥원',
};

// [개선사항3] "A004 항목은 표준중분류 '놀이방식당'에 데이터가 포함되지 않은 데이터들에
// 한해서.. 식품접객업소로 모아넣기" — 대표가 확인한 유일한 보호 대상. 실측 확인: 275건
// 전부 A004(식품접객업소) 소스 내에서만 존재하지만, 특정 코드로 범위를 좁히지 않고 이
// 값 자체를 전역적으로 보호한다(대표 지시 원문 "놀이방식당으로 중분류 된 것만 건들지
// 않으면 됨"과 정확히 일치 — 다른 코드에 같은 값이 섞여도 동일하게 보호됨).
const PRESERVED_CATEGORY_MIN = new Set(['놀이방식당']);

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
    // [개선사항3] "놀이방식당으로 중분류 된 것만 건들지 않으면 됨" — 유일한 보호 대상.
    if (PRESERVED_CATEGORY_MIN.has(row.category_min)) continue;
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
