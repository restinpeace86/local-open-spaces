import { describe, expect, it } from 'vitest';
import { applyCategoryRules, loadCategoryRulesGrouped, matchCategoryMin } from './category-rules.mjs';

// 실제 supabase-js 쿼리 빌더는 어느 체이닝 단계에서든 await 가능한 thenable이다(select().eq()...
// 를 끝까지 안 이어도 그 시점에 await하면 실행된다). category-rules.mjs가 쓰는 두 가지 체인
// 모양(loadCategoryRulesGrouped: .order()에서 바로 await / applyCategoryRulesToTable:
// .limit()에서 await)을 모두 지원하는 최소 페이크 빌더를 만든다.
function makeQueryBuilder(resolve) {
  const state = {};
  const builder = {
    eq(column, value) {
      state[column] = value;
      return builder;
    },
    is(column, value) {
      if (value === null) state[`${column}IsNull`] = true;
      return builder;
    },
    gt(column, value) {
      state.gtId = value;
      return builder;
    },
    order() {
      return builder;
    },
    limit(n) {
      state.limit = n;
      return builder;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolve(state)).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function makeFakeClient({ rules, openSpacesRows, eventsRows }) {
  const rowsByTable = { open_spaces: openSpacesRows ?? [], events: eventsRows ?? [] };

  return {
    from(table) {
      return {
        select: () =>
          makeQueryBuilder((state) => {
            if (table === 'category_rules') {
              const filtered = rules.filter((r) => r.target_table === state.target_table);
              return { data: filtered, error: null };
            }
            let filtered = rowsByTable[table];
            if (state.category_minIsNull) filtered = filtered.filter((r) => r.category_min === null);
            if (state.gtId) filtered = filtered.filter((r) => r.id > state.gtId);
            filtered = filtered.slice(0, state.limit ?? filtered.length);
            return { data: filtered.map((r) => ({ id: r.id, n: r.name })), error: null };
          }),
        update: (patch) =>
          makeQueryBuilder((state) => {
            const row = rowsByTable[table].find((r) => r.id === state.id);
            if (row && row.category_min === null) Object.assign(row, patch);
            return { error: null };
          }),
      };
    },
    _rowsByTable: rowsByTable,
  };
}

describe('matchCategoryMin', () => {
  it('첫 매칭 우선순위대로 category_min을 반환한다(풋살장이 축구장보다 먼저 선언되면 우선)', () => {
    const rules = [
      { category: '풋살장', include: ['풋살장'], exclude: [] },
      { category: '축구장', include: ['축구장'], exclude: [] },
    ];
    expect(matchCategoryMin('OO풋살장', rules)).toBe('풋살장');
    expect(matchCategoryMin('OO축구장', rules)).toBe('축구장');
  });

  it('exclude 키워드가 있으면 해당 규칙을 건너뛴다', () => {
    const rules = [{ category: '미술제작', include: ['미술'], exclude: ['미술관'] }];
    expect(matchCategoryMin('OO미술관 특별전', rules)).toBeNull();
    expect(matchCategoryMin('어린이 미술 만들기 교실', rules)).toBe('미술제작');
  });

  it('아무 규칙에도 안 걸리면 null을 반환한다', () => {
    const rules = [{ category: '수영장', include: ['수영장'], exclude: [] }];
    expect(matchCategoryMin('전혀 관련 없는 이름', rules)).toBeNull();
  });
});

describe('loadCategoryRulesGrouped', () => {
  it('target_table로 필터링하고 category_min별로 include/exclude를 그룹핑한다', async () => {
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
  it('category_min IS NULL인 행만 스캔해 매칭되면 RULE로 업데이트하고, 이미 값이 있는 행은 건드리지 않는다', async () => {
    const spaceRows = [
      { id: 'a', name: '올림픽수영장', category_min: null },
      { id: 'b', name: '관련없는이름', category_min: null },
      { id: 'c', name: '이미분류된곳', category_min: '캠핑장' },
    ];
    const eventRows = [{ id: 'd', name: '가을 축제', category_min: null }];

    const client = makeFakeClient({
      rules: [
        { id: 1, target_table: 'open_spaces', category_min: '수영장', keyword: '수영장', is_exclude: false },
        { id: 2, target_table: 'events', category_min: '문화행사', keyword: '축제', is_exclude: false },
      ],
      openSpacesRows: spaceRows,
      eventsRows: eventRows,
    });

    const result = await applyCategoryRules(client);

    expect(result.open_spaces.scanned).toBe(2); // category_min IS NULL 행만 스캔(2건, 'c'는 제외)
    expect(result.open_spaces.matched).toBe(1);
    expect(result.events.matched).toBe(1);

    expect(spaceRows.find((r) => r.id === 'a')).toMatchObject({ category_min: '수영장', category_min_source: 'RULE' });
    expect(spaceRows.find((r) => r.id === 'b').category_min).toBeNull();
    expect(spaceRows.find((r) => r.id === 'c').category_min).toBe('캠핑장'); // 기존 값 보존(덮어쓰지 않음)
    expect(eventRows.find((r) => r.id === 'd')).toMatchObject({ category_min: '문화행사', category_min_source: 'RULE' });
  });
});
