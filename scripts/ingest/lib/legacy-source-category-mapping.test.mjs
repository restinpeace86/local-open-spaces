import { describe, expect, it } from 'vitest';
import {
  applyLegacySourceCategoryMapping,
  PLAYGROUND_OUTDOOR,
  PLAYGROUND_INDOOR,
  SWIMMING_POOL_CATEGORY,
  KIDS_CAFE,
  WATER_PLAY_FACILITY,
} from './legacy-source-category-mapping.mjs';

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
            eq(column, value) {
              state[`eq_${column}`] = value;
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
              if ('is_category_min' in state) filtered = filtered.filter((r) => r.category_min === null);
              if ('eq_source_type' in state) filtered = filtered.filter((r) => r.source_type === state.eq_source_type);
              if ('gt_id' in state) filtered = filtered.filter((r) => r.id > state.gt_id);
              filtered = [...filtered].sort((a, b) => (a.id > b.id ? 1 : -1)).slice(0, n);
              return Promise.resolve({
                data: filtered.map((r) => ({ id: r.id, source_type: r.source_type, name: r.name, facility_type: r.facility_type })),
                error: null,
              });
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
              const matched = rows.filter((r) => state.inIds.includes(r.id) && r.category_min === value);
              for (const row of matched) Object.assign(row, patch);
              return Promise.resolve({ error: null, count: matched.length });
            },
          };
          return builder;
        },
      };
    },
  };
}

describe('applyLegacySourceCategoryMapping', () => {
  it('LOCALDATA_PLAYGROUND는 facility_type 기준으로 야외/실내 2종으로 매핑한다', async () => {
    const rows = [
      { id: '1', source_type: 'LOCALDATA_PLAYGROUND', name: '아파트1', facility_type: '야외', category_min: null },
      { id: '2', source_type: 'LOCALDATA_PLAYGROUND', name: '아파트2', facility_type: '실내', category_min: null },
      { id: '3', source_type: 'LOCALDATA_PLAYGROUND', name: '아파트3', facility_type: '기타값', category_min: null },
    ];
    const client = makeFakeClient(rows);
    const result = await applyLegacySourceCategoryMapping(client);

    expect(rows.find((r) => r.id === '1').category_min).toBe(PLAYGROUND_OUTDOOR);
    expect(rows.find((r) => r.id === '2').category_min).toBe(PLAYGROUND_INDOOR);
    // facility_type이 예상 밖 값이면 손대지 않는다(추측 금지)
    expect(rows.find((r) => r.id === '3').category_min).toBeNull();
    expect(result.updated).toBe(2);
  });

  it('SWIMMING_POOL은 이름과 무관하게 전량 수영장으로 매핑한다', async () => {
    const rows = [
      { id: '1', source_type: 'SWIMMING_POOL', name: '스윔아이', facility_type: '복합', category_min: null },
      { id: '2', source_type: 'SWIMMING_POOL', name: '짐스아쿠아', facility_type: null, category_min: null },
    ];
    const client = makeFakeClient(rows);
    const result = await applyLegacySourceCategoryMapping(client);

    expect(rows.find((r) => r.id === '1').category_min).toBe(SWIMMING_POOL_CATEGORY);
    expect(rows.find((r) => r.id === '2').category_min).toBe(SWIMMING_POOL_CATEGORY);
    expect(result.updated).toBe(2);
  });

  it('LOCALDATA_AMUSEMENT는 이름에 키즈카페가 포함된 행만 매핑하고, LOCALDATA_PLAYGROUND의 키즈카페는 손대지 않는다', async () => {
    const rows = [
      { id: '1', source_type: 'LOCALDATA_AMUSEMENT', name: '펀플 키즈카페', facility_type: '복합', category_min: null },
      { id: '2', source_type: 'LOCALDATA_AMUSEMENT', name: '호텔159', facility_type: '복합', category_min: null },
      // 실측: '키즈카페'가 LOCALDATA_PLAYGROUND 이름에도 우연히 포함되는 경우가 있었다 —
      // source_type이 다르므로 이 행은 절대 '키즈카페'로 분류되면 안 된다(대신 facility_type 규칙 적용).
      { id: '3', source_type: 'LOCALDATA_PLAYGROUND', name: '리틀비틀 키즈카페 죽전점', facility_type: '실내', category_min: null },
    ];
    const client = makeFakeClient(rows);
    const result = await applyLegacySourceCategoryMapping(client);

    expect(rows.find((r) => r.id === '1').category_min).toBe(KIDS_CAFE);
    expect(rows.find((r) => r.id === '2').category_min).toBeNull();
    expect(rows.find((r) => r.id === '3').category_min).toBe(PLAYGROUND_INDOOR);
    expect(result.updated).toBe(2);
  });

  it('GG_EVENTS는 바닥분수 또는 물놀이가 포함된 행만 매핑한다', async () => {
    const rows = [
      { id: '1', source_type: 'GG_EVENTS', name: '해솔마을 바닥분수', facility_type: '야외', category_min: null },
      { id: '2', source_type: 'GG_EVENTS', name: '힐스테이트 물놀이형 수경시설', facility_type: '야외', category_min: null },
      { id: '3', source_type: 'GG_EVENTS', name: '위례아너스포레', facility_type: '야외', category_min: null },
    ];
    const client = makeFakeClient(rows);
    const result = await applyLegacySourceCategoryMapping(client);

    expect(rows.find((r) => r.id === '1').category_min).toBe(WATER_PLAY_FACILITY);
    expect(rows.find((r) => r.id === '2').category_min).toBe(WATER_PLAY_FACILITY);
    expect(rows.find((r) => r.id === '3').category_min).toBeNull();
    expect(result.updated).toBe(2);
  });

  it('이미 category_min이 채워진 행은 절대 덮어쓰지 않는다', async () => {
    const rows = [
      { id: '1', source_type: 'SWIMMING_POOL', name: '스윔아이', facility_type: '복합', category_min: '기존값' },
    ];
    const client = makeFakeClient(rows);
    const result = await applyLegacySourceCategoryMapping(client);

    expect(rows.find((r) => r.id === '1').category_min).toBe('기존값');
    expect(result.updated).toBe(0);
  });

  it('breakdown에 source_type별 매핑 건수를 정확히 집계한다', async () => {
    const rows = [
      { id: '1', source_type: 'LOCALDATA_PLAYGROUND', name: 'a', facility_type: '야외', category_min: null },
      { id: '2', source_type: 'LOCALDATA_PLAYGROUND', name: 'b', facility_type: '실내', category_min: null },
      { id: '3', source_type: 'SWIMMING_POOL', name: 'c', facility_type: null, category_min: null },
    ];
    const client = makeFakeClient(rows);
    const result = await applyLegacySourceCategoryMapping(client);

    expect(result.breakdown.LOCALDATA_PLAYGROUND).toEqual({ [PLAYGROUND_OUTDOOR]: 1, [PLAYGROUND_INDOOR]: 1 });
    expect(result.breakdown.SWIMMING_POOL).toEqual({ [SWIMMING_POOL_CATEGORY]: 1 });
  });
});
