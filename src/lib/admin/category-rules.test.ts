import { describe, expect, it } from 'vitest';
import { applyCategoryRules, loadCategoryRulesGrouped, matchCategoryMin, CategoryRule } from './category-rules';

// scripts/ingest/lib/category-rules.test.mjs와 동일한 페이크 빌더 패턴(실제 supabase-js
// 쿼리 체인이 어느 단계에서든 await 가능한 thenable이라는 점을 그대로 재현).
type FakeState = Record<string, unknown>;

function makeQueryBuilder(resolve: (state: FakeState) => unknown) {
  const state: FakeState = {};
  const builder = {
    eq(column: string, value: unknown) {
      state[column] = value;
      return builder;
    },
    is(column: string, value: unknown) {
      if (value === null) state[`${column}IsNull`] = true;
      return builder;
    },
    gt(column: string, value: unknown) {
      state.gtId = value;
      return builder;
    },
    order() {
      return builder;
    },
    limit(n: number) {
      state.limit = n;
      return builder;
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolve(state)).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

type FakeRow = { id: string; name: string; category_min: string | null };

function makeFakeClient(opts: {
  rules: { id: number; target_table: string; category_min: string; keyword: string; is_exclude: boolean }[];
  openSpacesRows?: FakeRow[];
  eventsRows?: FakeRow[];
}) {
  const rowsByTable: Record<string, FakeRow[]> = {
    open_spaces: opts.openSpacesRows ?? [],
    events: opts.eventsRows ?? [],
  };

  return {
    from(table: string) {
      return {
        select: () =>
          makeQueryBuilder((state) => {
            if (table === 'category_rules') {
              const filtered = opts.rules.filter((r) => r.target_table === state.target_table);
              return { data: filtered, error: null };
            }
            let filtered = rowsByTable[table];
            if (state.category_minIsNull) filtered = filtered.filter((r) => r.category_min === null);
            if (state.gtId) filtered = filtered.filter((r) => r.id > (state.gtId as string));
            filtered = filtered.slice(0, (state.limit as number) ?? filtered.length);
            return { data: filtered.map((r) => ({ id: r.id, n: r.name })), error: null };
          }),
        update: (patch: Record<string, unknown>) =>
          makeQueryBuilder((state) => {
            const row = rowsByTable[table].find((r) => r.id === state.id);
            if (row && row.category_min === null) Object.assign(row, patch);
            return { error: null };
          }),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    },
  } as any;
}

describe('matchCategoryMin', () => {
  it('첫 매칭 우선순위대로 category를 반환한다', () => {
    const rules: CategoryRule[] = [
      { category: '풋살장', include: ['풋살장'], exclude: [] },
      { category: '축구장', include: ['축구장'], exclude: [] },
    ];
    expect(matchCategoryMin('OO풋살장', rules)).toBe('풋살장');
    expect(matchCategoryMin('OO축구장', rules)).toBe('축구장');
  });

  it('exclude 키워드가 있으면 해당 규칙을 건너뛴다', () => {
    const rules: CategoryRule[] = [{ category: '미술제작', include: ['미술'], exclude: ['미술관'] }];
    expect(matchCategoryMin('OO미술관 특별전', rules)).toBeNull();
    expect(matchCategoryMin('어린이 미술 만들기 교실', rules)).toBe('미술제작');
  });

  it('아무 규칙에도 안 걸리면 null을 반환한다', () => {
    expect(matchCategoryMin('전혀 관련 없는 이름', [{ category: '수영장', include: ['수영장'], exclude: [] }])).toBeNull();
  });
});

describe('loadCategoryRulesGrouped', () => {
  it('target_table로 필터링하고 category_min별로 그룹핑한다', async () => {
    const client = makeFakeClient({
      rules: [
        { id: 1, target_table: 'open_spaces', category_min: '풋살장', keyword: '풋살장', is_exclude: false },
        { id: 2, target_table: 'events', category_min: '미술제작', keyword: '미술관', is_exclude: true },
      ],
    });

    const grouped = await loadCategoryRulesGrouped(client, 'open_spaces');
    expect(grouped).toEqual([{ category: '풋살장', include: ['풋살장'], exclude: [] }]);
  });
});

describe('applyCategoryRules', () => {
  it('category_min IS NULL 행만 스캔해 RULE로 채우고, 기존 값이 있는 행은 보존한다', async () => {
    const spaceRows: FakeRow[] = [
      { id: 'a', name: '올림픽수영장', category_min: null },
      { id: 'b', name: '관련없는이름', category_min: null },
      { id: 'c', name: '이미분류된곳', category_min: '캠핑장' },
    ];
    const eventRows: FakeRow[] = [{ id: 'd', name: '가을 축제', category_min: null }];

    const client = makeFakeClient({
      rules: [
        { id: 1, target_table: 'open_spaces', category_min: '수영장', keyword: '수영장', is_exclude: false },
        { id: 2, target_table: 'events', category_min: '문화행사', keyword: '축제', is_exclude: false },
      ],
      openSpacesRows: spaceRows,
      eventsRows: eventRows,
    });

    const result = await applyCategoryRules(client);

    expect(result.open_spaces.scanned).toBe(2);
    expect(result.open_spaces.matched).toBe(1);
    expect(result.events.matched).toBe(1);
    expect(spaceRows.find((r) => r.id === 'a')?.category_min).toBe('수영장');
    expect(spaceRows.find((r) => r.id === 'c')?.category_min).toBe('캠핑장');
  });
});
