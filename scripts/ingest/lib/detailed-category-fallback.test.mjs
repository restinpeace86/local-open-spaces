import { describe, expect, it } from 'vitest';
import { applyDetailedCategoryFallback, ELIGIBLE_SOURCE_TYPES } from './detailed-category-fallback.mjs';

function makeFakeClient(rows) {
  return {
    from() {
      return {
        select() {
          const state = {};
          const builder = {
            is(column, value) {
              state[`is_${column}`] = value;
              return builder;
            },
            in(column, values) {
              state[`in_${column}`] = values;
              return builder;
            },
            order() {
              return builder;
            },
            gt(column, value) {
              state[`gt_${column}`] = value;
              return builder;
            },
            limit(n) {
              let filtered = rows;
              if ('is_category_min' in state) {
                filtered = filtered.filter((r) => (state.is_category_min === null ? r.category_min === null : true));
              }
              if ('in_source_type' in state) {
                filtered = filtered.filter((r) => state.in_source_type.includes(r.source_type));
              }
              if ('gt_id' in state) {
                filtered = filtered.filter((r) => r.id > state.gt_id);
              }
              filtered = [...filtered].sort((a, b) => (a.id > b.id ? 1 : -1)).slice(0, n);
              return Promise.resolve({ data: filtered.map((r) => ({ id: r.id })), error: null });
            },
          };
          return builder;
        },
        update(patch) {
          const state = {};
          const builder = {
            in(column, values) {
              state.inIds = values;
              return builder;
            },
            is(column, value) {
              state[`is_${column}`] = value;
              return { then: (resolve) => resolve(applyUpdate()) };
            },
          };
          function applyUpdate() {
            const matched = rows.filter(
              (r) => state.inIds.includes(r.id) && (!('is_category_min' in state) || r.category_min === state.is_category_min)
            );
            for (const row of matched) Object.assign(row, patch);
            return { error: null, count: matched.length };
          }
          return builder;
        },
      };
    },
  };
}

describe('applyDetailedCategoryFallback', () => {
  it('허용된 source_type이면서 category_min이 NULL인 행만 기타로 채운다', async () => {
    const rows = [
      { id: '1', source_type: 'KOR_TOUR_API_V4', category_min: null },
      { id: '2', source_type: 'KOR_TOUR_API_V4', category_min: '도서관' },
      { id: '3', source_type: 'CITY_PARK', category_min: null },
    ];
    const client = makeFakeClient(rows);

    const result = await applyDetailedCategoryFallback(client);

    expect(rows.find((r) => r.id === '1').category_min).toBe('기타');
    expect(rows.find((r) => r.id === '2').category_min).toBe('도서관');
    expect(rows.find((r) => r.id === '3').category_min).toBe('기타');
    expect(result.updated).toBe(2);
  });

  it('허용되지 않은 source_type(예: LOCALDATA_PLAYGROUND)은 NULL이어도 건드리지 않는다', async () => {
    const rows = [
      { id: '1', source_type: 'LOCALDATA_PLAYGROUND', category_min: null },
      { id: '2', source_type: 'LOCALDATA_AMUSEMENT', category_min: null },
      { id: '3', source_type: 'SWIMMING_POOL', category_min: null },
      { id: '4', source_type: 'GG_EVENTS', category_min: null },
    ];
    const client = makeFakeClient(rows);

    const result = await applyDetailedCategoryFallback(client);

    for (const row of rows) {
      expect(row.category_min).toBeNull();
    }
    expect(result.updated).toBe(0);
  });

  it('ELIGIBLE_SOURCE_TYPES는 8개 소스로 고정되어 있다', () => {
    expect(ELIGIBLE_SOURCE_TYPES).toHaveLength(8);
    expect(ELIGIBLE_SOURCE_TYPES).not.toContain('LOCALDATA_PLAYGROUND');
    expect(ELIGIBLE_SOURCE_TYPES).not.toContain('LOCALDATA_AMUSEMENT');
    expect(ELIGIBLE_SOURCE_TYPES).not.toContain('SWIMMING_POOL');
    expect(ELIGIBLE_SOURCE_TYPES).not.toContain('GG_EVENTS');
  });
});
