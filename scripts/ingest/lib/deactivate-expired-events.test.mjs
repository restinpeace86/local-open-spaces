import { describe, expect, it } from 'vitest';
import { computeExpiryCutoffDate, deactivateExpiredEvents } from './deactivate-expired-events.mjs';

describe('computeExpiryCutoffDate', () => {
  it('유예 없이(D+1 즉시 비활성화) UTC 기준 오늘 날짜를 그대로 반환한다(CURRENT_DATE와 동일)', () => {
    const now = new Date('2026-08-26T15:30:00Z');
    expect(computeExpiryCutoffDate(now)).toBe('2026-08-26');
  });

  it('월 경계를 넘어가도 정확히 계산한다', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    expect(computeExpiryCutoffDate(now)).toBe('2026-09-01');
  });
});

function makeFakeClient(rows) {
  return {
    from(table) {
      return {
        update(patch) {
          const state = {};
          const builder = {
            lt(column, value) {
              state.lt = { column, value };
              return builder;
            },
            eq(column, value) {
              state.eq = { column, value };
              return builder;
            },
            select() {
              const matched = rows.filter(
                (r) =>
                  table === 'events' &&
                  (!state.lt || r[state.lt.column] < state.lt.value) &&
                  (!state.eq || r[state.eq.column] === state.eq.value)
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

describe('deactivateExpiredEvents', () => {
  it('컷오프(오늘)보다 이전에 끝났고 현재 is_active=true인 행만 false로 바꾸고 개수를 정확히 센다', async () => {
    const rows = [
      { id: 'expired-active', end_date: '2026-08-01', is_active: true },
      { id: 'expired-already-inactive', end_date: '2026-08-01', is_active: false },
      { id: 'still-ongoing-active', end_date: '2026-08-26', is_active: true },
    ];
    const client = makeFakeClient(rows);

    const result = await deactivateExpiredEvents(client, new Date('2026-08-26T00:00:00Z'));

    expect(result.cutoffDate).toBe('2026-08-26');
    expect(result.deactivatedCount).toBe(1);
    expect(rows.find((r) => r.id === 'expired-active').is_active).toBe(false);
    expect(rows.find((r) => r.id === 'still-ongoing-active').is_active).toBe(true);
  });

  it('[D+1 즉시 비활성화] 종료일이 하루만 지나도(어제 종료) 즉시 비활성화한다', async () => {
    const rows = [{ id: 'ended-yesterday', end_date: '2026-08-25', is_active: true }];
    const client = makeFakeClient(rows);

    const result = await deactivateExpiredEvents(client, new Date('2026-08-26T00:00:00Z'));

    expect(result.deactivatedCount).toBe(1);
    expect(rows[0].is_active).toBe(false);
  });

  it('만료 대상이 없으면 deactivatedCount 0을 반환한다', async () => {
    const rows = [{ id: 'fresh', end_date: '2026-08-26', is_active: true }];
    const client = makeFakeClient(rows);

    const result = await deactivateExpiredEvents(client, new Date('2026-08-26T00:00:00Z'));

    expect(result.deactivatedCount).toBe(0);
  });
});
