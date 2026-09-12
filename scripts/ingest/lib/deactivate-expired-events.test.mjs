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

// [만료 비활성화 누락 백로그 수정](2026-09-12 사용자 지시): 이제 이 함수는 한 번의
// UPDATE...RETURNING이 아니라 "id를 소량 SELECT → 그 id로만 UPDATE"를 반복한다.
// capPerSelect: PostgREST max_rows(supabase/config.toml, 1000)를 시뮬레이션한다 —
// 실제로는 BATCH_SIZE(200)로 이미 그보다 작게 요청하므로 평소엔 걸리지 않지만, 이
// 캡이 이제 select()에만 적용되고 update()에는 전혀 영향을 주지 않음을 함께 검증한다.
function makeFakeClient(rows, { capPerSelect = Infinity } = {}) {
  let selectCallCount = 0;
  let updateCallCount = 0;
  return {
    selectCallCount: () => selectCallCount,
    updateCallCount: () => updateCallCount,
    from(table) {
      if (table !== 'events') throw new Error(`unexpected table: ${table}`);
      return {
        select() {
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
            limit(n) {
              selectCallCount += 1;
              const matched = rows.filter(
                (r) => (!state.lt || r[state.lt.column] < state.lt.value) && (!state.eq || r[state.eq.column] === state.eq.value)
              );
              const capped = matched.slice(0, Math.min(n, capPerSelect));
              return Promise.resolve({ data: capped.map((r) => ({ id: r.id })), error: null });
            },
          };
          return builder;
        },
        update(patch) {
          return {
            in(column, ids) {
              updateCallCount += 1;
              const idSet = new Set(ids);
              const matched = rows.filter((r) => idSet.has(r[column]));
              for (const row of matched) Object.assign(row, patch);
              return Promise.resolve({ error: null });
            },
          };
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

  it('만료 대상이 없으면 deactivatedCount 0을 반환하고 update는 호출하지 않는다', async () => {
    const rows = [{ id: 'fresh', end_date: '2026-08-26', is_active: true }];
    const client = makeFakeClient(rows);

    const result = await deactivateExpiredEvents(client, new Date('2026-08-26T00:00:00Z'));

    expect(result.deactivatedCount).toBe(0);
    expect(client.updateCallCount()).toBe(0);
  });

  // [만료 비활성화 누락 백로그 수정](2026-09-12 사용자 지시): "아주 옛날 이벤트들도 다
  // 나오고 있어" — 실측 확인 결과 원인은 `.update(...).select('id')` 단 한 번 호출이
  // PostgREST max_rows(1000)에 걸려 매일 최대 1000건만 비활성화되던 것이었다(21,453건
  // 백로그 실측). id를 소량(BATCH_SIZE=200)씩 SELECT한 뒤 그 id로만 UPDATE하는 방식으로
  // 바꿔, 대상이 아무리 많아도(여기선 450건, 배치 크기를 200으로 시뮬레이션) 전부
  // 비활성화될 때까지 반복해야 한다.
  it('만료 대상이 한 배치보다 많아도(450건, 배치 200건 시뮬레이션) 반복해서 전부 비활성화한다', async () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({
      id: `expired-${i}`,
      end_date: '2026-08-01',
      is_active: true,
    }));
    const client = makeFakeClient(rows, { capPerSelect: 200 });

    const result = await deactivateExpiredEvents(client, new Date('2026-08-26T00:00:00Z'));

    expect(result.deactivatedCount).toBe(450);
    expect(rows.every((r) => r.is_active === false)).toBe(true);
    // 200 + 200 + 50(마지막 배치, 상한 미달이라 바로 종료) = 3회.
    expect(client.selectCallCount()).toBe(3);
    expect(client.updateCallCount()).toBe(3);
  });
});
