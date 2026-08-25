import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

// [카테고리 정제 & 어드민 확장](2026-08-26) — Admin API(Next.js) 쪽 구현.
// scripts/ingest/lib/category-rules.mjs와 동일한 알고리즘의 TypeScript 버전이다. 이 프로젝트는
// scripts/(Node 인제스트 스크립트)와 src/(Next.js 앱)가 서로 import를 주고받지 않는 기존
// 관례(src/lib/geo/region-hierarchy.ts 주석 참고)를 따르기 위해 로직을 의도적으로 중복
// 구현했다 — 두 빌드 타깃(별도 런타임/배포 파이프라인)을 분리 유지하기 위함.

type AdminSupabaseClient = SupabaseClient<Database>;
export type TargetTable = 'open_spaces' | 'events';

export type CategoryRule = {
  category: string;
  include: string[];
  exclude: string[];
};

export async function loadCategoryRulesGrouped(
  client: AdminSupabaseClient,
  targetTable: TargetTable
): Promise<CategoryRule[]> {
  const { data, error } = await client
    .from('category_rules')
    .select('id, category_min, keyword, is_exclude')
    .eq('target_table', targetTable)
    .order('id', { ascending: true });

  if (error) throw new Error(`category_rules 조회 실패(${targetTable}): ${error.message}`);

  const byCategory = new Map<string, CategoryRule>();
  for (const row of data ?? []) {
    const entry = byCategory.get(row.category_min) ?? { category: row.category_min, include: [], exclude: [] };
    if (row.is_exclude) entry.exclude.push(row.keyword);
    else entry.include.push(row.keyword);
    byCategory.set(row.category_min, entry);
  }
  return [...byCategory.values()];
}

export function matchCategoryMin(text: string | null | undefined, rules: CategoryRule[]): string | null {
  if (!text) return null;
  for (const rule of rules) {
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

async function applyCategoryRulesToTable(
  client: AdminSupabaseClient,
  table: TargetTable,
  nameColumn: 'name' | 'title',
  rules: CategoryRule[]
): Promise<{ scanned: number; matched: number; categoryCounts: Record<string, number> }> {
  let lastId: string | null = null;
  let scanned = 0;
  let matched = 0;
  const categoryCounts: Record<string, number> = {};

  if (rules.length === 0) return { scanned, matched, categoryCounts };

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

    const rows = data as unknown as { id: string; n: string | null }[];
    const updates: { id: string; category: string }[] = [];
    for (const row of rows) {
      scanned += 1;
      const category = matchCategoryMin(row.n, rules);
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

    lastId = rows[rows.length - 1].id;
    if (rows.length < SCAN_PAGE_SIZE) break;
  }

  return { scanned, matched, categoryCounts };
}

export type ApplyCategoryRulesResult = {
  open_spaces: { scanned: number; matched: number; categoryCounts: Record<string, number> };
  events: { scanned: number; matched: number; categoryCounts: Record<string, number> };
};

// "[규칙 기반 일괄 재분류 실행]" 버튼과 배치 오케스트레이터(run-daily.mjs/run-monthly.mjs)가
// 같은 의미로 공유하는 진입점 — category_min IS NULL인 행에만 적용한다(RAW/RULE/MANUAL로
// 이미 채워진 행은 덮어쓰지 않음).
export async function applyCategoryRules(client: AdminSupabaseClient): Promise<ApplyCategoryRulesResult> {
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
