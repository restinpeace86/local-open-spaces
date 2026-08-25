// [카테고리 정제 & 어드민 확장] Dynamic Keyword Rule Engine — 수집 파이프라인(Node 스크립트)
// 쪽 구현. DB `category_rules` 테이블을 Source of Truth로 삼아 name/title 텍스트를 스캔해
// `category_min`/`category_min_source='RULE'`을 채운다.
//
// 이 파일은 scripts/ 전용이다 — src/lib/admin/category-rules.ts에 동일 로직의 TypeScript
// 버전이 별도로 있다(region-hierarchy.ts 주석에 이미 명시된 이 프로젝트의 기존 관례: scripts/와
// src/는 서로 import를 주고받지 않는다 — 두 런타임/빌드 타깃을 분리 유지하기 위해 로직을
// 의도적으로 중복 구현했다).

// category_rules를 target_table별로 그룹핑한다. id 오름차순(등록 순서)이 매칭 우선순위다
// (예: "풋살장"이 "축구장"보다 먼저 선언돼 있으면 "OO풋살장"이 "축구장"으로 먼저 걸리지 않음).
export async function loadCategoryRulesGrouped(client, targetTable) {
  const { data, error } = await client
    .from('category_rules')
    .select('id, category_min, keyword, is_exclude')
    .eq('target_table', targetTable)
    .order('id', { ascending: true });
  if (error) throw new Error(`category_rules 조회 실패(${targetTable}): ${error.message}`);

  const byCategory = new Map();
  for (const row of data ?? []) {
    const entry = byCategory.get(row.category_min) ?? { category: row.category_min, include: [], exclude: [] };
    if (row.is_exclude) entry.exclude.push(row.keyword);
    else entry.include.push(row.keyword);
    byCategory.set(row.category_min, entry);
  }
  // Map은 첫 삽입 순서를 보존하므로 이 순서 그대로 순회하면 id 오름차순(우선순위)이 유지된다.
  return [...byCategory.values()];
}

// text에 포함된 키워드로 첫 번째로 매칭되는 category_min을 반환한다(첫 매칭 우선, exclude
// 키워드가 있으면 그 규칙은 건너뛴다). 매칭되는 규칙이 없으면 null.
export function matchCategoryMin(text, rulesByCategory) {
  if (!text) return null;
  for (const rule of rulesByCategory) {
    const hit = rule.include.some((kw) => text.includes(kw));
    if (!hit) continue;
    const blocked = rule.exclude.some((kw) => text.includes(kw));
    if (blocked) continue;
    return rule.category;
  }
  return null;
}

const SCAN_PAGE_SIZE = 500;
const UPDATE_BATCH_SIZE = 200;

// category_min IS NULL인 행을 대상으로 규칙을 적용해 UPDATE한다(category_min_source='RULE').
// id 기준 Keyset 페이지네이션을 쓴다 — OFFSET 기반 .range()는 대형 테이블(15만 건대)에서
// statement timeout을 일으킴을 실측 확인했다(docs/category-mapping-dryrun-report.md 작성
// 과정에서 발견).
async function applyCategoryRulesToTable(client, table, nameColumn, rulesByCategory) {
  let lastId = null;
  let scanned = 0;
  let matched = 0;
  const categoryCounts = {};

  if (rulesByCategory.length === 0) return { scanned, matched, categoryCounts };

  for (;;) {
    let query = client
      .from(table)
      .select(`id, n:${nameColumn}`)
      .is('category_min', null)
      .order('id', { ascending: true })
      .limit(SCAN_PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    const { data, error } = await query;
    if (error) throw new Error(`${table} 재분류 스캔 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    const updates = [];
    for (const row of data) {
      scanned += 1;
      const category = matchCategoryMin(row.n ?? '', rulesByCategory);
      if (category) {
        matched += 1;
        categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
        updates.push({ id: row.id, category });
      }
    }

    for (let i = 0; i < updates.length; i += UPDATE_BATCH_SIZE) {
      const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);
      await Promise.all(
        batch.map((u) =>
          client
            .from(table)
            .update({ category_min: u.category, category_min_source: 'RULE' })
            .eq('id', u.id)
            .is('category_min', null)
        )
      );
    }

    lastId = data[data.length - 1].id;
    if (data.length < SCAN_PAGE_SIZE) break;
  }

  return { scanned, matched, categoryCounts };
}

// 배치 오케스트레이터(run-daily.mjs/run-monthly.mjs)와 Admin "일괄 재분류 실행" 버튼이 공유하는
// 진입점. open_spaces/events 양쪽에 대해 category_min IS NULL인 신규/미분류 행에만 규칙을
// 적용한다(이미 RAW/RULE/MANUAL로 채워진 행은 건드리지 않음 — 덮어쓰기 금지).
export async function applyCategoryRules(client) {
  const [openSpacesRules, eventsRules] = await Promise.all([
    loadCategoryRulesGrouped(client, 'open_spaces'),
    loadCategoryRulesGrouped(client, 'events'),
  ]);

  const [openSpacesResult, eventsResult] = await Promise.all([
    applyCategoryRulesToTable(client, 'open_spaces', 'name', openSpacesRules),
    applyCategoryRulesToTable(client, 'events', 'title', eventsRules),
  ]);

  return { open_spaces: openSpacesResult, events: eventsResult };
}
