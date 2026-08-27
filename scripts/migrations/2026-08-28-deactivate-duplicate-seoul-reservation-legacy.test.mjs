import { describe, expect, it } from 'vitest';
import { deactivateDuplicateSeoulReservationLegacy } from './2026-08-28-deactivate-duplicate-seoul-reservation-legacy.mjs';

function makeFakeClient(rows) {
  return {
    from() {
      return {
        select() {
          const state = {};
          const builder = {
            like(column, pattern) {
              state.likePrefix = pattern.replace('%', '');
              return builder;
            },
            eq(column, value) {
              state[column] = value;
              return builder;
            },
            in(column, values) {
              state.inIds = values;
              return builder;
            },
            range(from, to) {
              let filtered = rows.filter((r) => r.external_id.startsWith(state.likePrefix));
              if ('is_active' in state) filtered = filtered.filter((r) => r.is_active === state.is_active);
              filtered = filtered.slice(from, to + 1);
              return Promise.resolve({ data: filtered.map((r) => ({ id: r.id, external_id: r.external_id, raw_data: r.raw_data })), error: null });
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
            eq(column, value) {
              state[column] = value;
              return builder;
            },
            select() {
              const matched = rows.filter(
                (r) => state.inIds.includes(r.id) && (!('is_active' in state) || r.is_active === state.is_active)
              );
              for (const row of matched) Object.assign(row, patch);
              return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

describe('deactivateDuplicateSeoulReservationLegacy', () => {
  it('대응하는 활성 SEOUL_YEYAK_* 행이 있는 legacy 행만 비활성화한다', async () => {
    const rows = [
      { id: 'legacy-dup', external_id: 'SEOUL_RESERVATION_S1', is_active: true, raw_data: { SVCID: 'S1' } },
      { id: 'yeyak-current', external_id: 'SEOUL_YEYAK_S1', is_active: true, raw_data: { SVCID: 'S1' } },
      { id: 'legacy-orphan', external_id: 'SEOUL_RESERVATION_S2', is_active: true, raw_data: { SVCID: 'S2' } },
      { id: 'legacy-no-svcid', external_id: 'SEOUL_RESERVATION_S3', is_active: true, raw_data: {} },
      {
        id: 'legacy-yeyak-inactive',
        external_id: 'SEOUL_RESERVATION_S4',
        is_active: true,
        raw_data: { SVCID: 'S4' },
      },
      { id: 'yeyak-inactive', external_id: 'SEOUL_YEYAK_S4', is_active: false, raw_data: { SVCID: 'S4' } },
    ];
    const client = makeFakeClient(rows);

    const result = await deactivateDuplicateSeoulReservationLegacy({ dryRun: false }, client);

    expect(rows.find((r) => r.id === 'legacy-dup').is_active).toBe(false);
    expect(rows.find((r) => r.id === 'yeyak-current').is_active).toBe(true);
    expect(rows.find((r) => r.id === 'legacy-orphan').is_active).toBe(true);
    expect(rows.find((r) => r.id === 'legacy-no-svcid').is_active).toBe(true);
    // 대응 SEOUL_YEYAK_ 행이 존재하지만 그 행 자체가 비활성이면(SEOUL_YEYAK_S4) 진짜 중복이
    // 아니므로(살아있는 대응 행이 없는 것과 동일) legacy 행을 그대로 둔다.
    expect(rows.find((r) => r.id === 'legacy-yeyak-inactive').is_active).toBe(true);

    expect(result.scanned).toBe(4);
    expect(result.deactivated).toBe(1);
    expect(result.noSvcid).toBe(1);
    expect(result.noActiveMatch).toBe(2);
  });

  it('dry-run에서는 실제 UPDATE 없이 건수만 집계한다', async () => {
    const rows = [
      { id: 'legacy-dup', external_id: 'SEOUL_RESERVATION_S1', is_active: true, raw_data: { SVCID: 'S1' } },
      { id: 'yeyak-current', external_id: 'SEOUL_YEYAK_S1', is_active: true, raw_data: { SVCID: 'S1' } },
    ];
    const client = makeFakeClient(rows);

    const result = await deactivateDuplicateSeoulReservationLegacy({ dryRun: true }, client);

    expect(result.toDeactivateCount).toBe(1);
    expect(rows.find((r) => r.id === 'legacy-dup').is_active).toBe(true);
  });
});
