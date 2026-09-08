import { describe, expect, it, vi } from 'vitest';

// [한시성 예약 스팟 자동 삭제](2026-09-09 사용자 지시): "예약일자 기준 end date가
// 지난건 open_spaces에서 삭제해버리자" — 실제 파일시스템에 백업을 남기지 않도록
// fs를 스텁한다(백업 자체는 dedupeOpenSpaces와 동일한 검증된 패턴을 그대로 재사용
// 했을 뿐이라 이 테스트의 관심사가 아니다).
vi.mock('fs', () => ({
  default: { mkdirSync: vi.fn(), writeFileSync: vi.fn() },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const { deleteExpiredReservationSpaces } = await import('./delete-expired-reservation-spaces.mjs');

function makeFakeClient(rows) {
  const deletedIds = [];
  return {
    deletedIds,
    from(table) {
      return {
        select() {
          const state = {};
          const builder = {
            eq(column, value) {
              state.eq = { column, value };
              return builder;
            },
            order() {
              return builder;
            },
            limit() {
              return builder;
            },
            gt(column, value) {
              state.gt = { column, value };
              return builder;
            },
            then(resolve) {
              const matched = rows.filter(
                (r) =>
                  table === 'open_spaces' &&
                  (!state.eq || r[state.eq.column] === state.eq.value) &&
                  (!state.gt || r.id > state.gt.value)
              );
              resolve({ data: matched, error: null });
            },
          };
          return builder;
        },
        delete() {
          const builder = {
            in(column, ids) {
              deletedIds.push(...ids);
              return Promise.resolve({ error: null, count: ids.length });
            },
          };
          return builder;
        },
      };
    },
  };
}

function makeRow(overrides) {
  return {
    id: overrides.id,
    external_id: overrides.external_id ?? `EXT_${overrides.id}`,
    source: overrides.source ?? 'seoul_public_reservation',
    name: overrides.name ?? '테스트 스팟',
    address: overrides.address ?? null,
    created_at: overrides.created_at ?? '2026-07-01T00:00:00.000Z',
    raw_data: overrides.raw_data ?? {},
  };
}

describe('deleteExpiredReservationSpaces', () => {
  it('SVCOPNENDDT가 컷오프보다 이전인 seoul_public_reservation 행만 삭제한다', async () => {
    const rows = [
      makeRow({ id: 'a', name: '8월 캠핑존', raw_data: { SVCOPNENDDT: '2026-08-31 00:00:00.0' } }),
      makeRow({ id: 'b', name: '9월 글램핑존', raw_data: { SVCOPNENDDT: '2026-09-30 00:00:00.0' } }),
    ];
    const client = makeFakeClient(rows);

    const result = await deleteExpiredReservationSpaces(client, { now: new Date('2026-09-05T00:00:00Z') });

    expect(result.cutoffDate).toBe('2026-09-05');
    expect(result.deletedCount).toBe(1);
    expect(client.deletedIds).toEqual(['a']);
  });

  it('SVCOPNENDDT가 없는 행은 판단할 근거가 없어 삭제 대상에서 제외한다', async () => {
    const rows = [makeRow({ id: 'a', raw_data: {} })];
    const client = makeFakeClient(rows);

    const result = await deleteExpiredReservationSpaces(client, { now: new Date('2026-09-05T00:00:00Z') });

    expect(result.deletedCount).toBe(0);
    expect(client.deletedIds).toEqual([]);
  });

  it('종료일 당일까지는 삭제하지 않고, 다음날부터 삭제한다(deactivateExpiredEvents와 동일한 유예 0일 정책)', async () => {
    const rows = [makeRow({ id: 'a', raw_data: { SVCOPNENDDT: '2026-09-05 00:00:00.0' } })];

    const stillValid = await deleteExpiredReservationSpaces(makeFakeClient(rows), { now: new Date('2026-09-05T12:00:00Z') });
    expect(stillValid.deletedCount).toBe(0);

    const expiredNow = await deleteExpiredReservationSpaces(makeFakeClient(rows), { now: new Date('2026-09-06T00:00:00Z') });
    expect(expiredNow.deletedCount).toBe(1);
  });

  it('만료 대상이 없으면 deletedCount 0과 backupFile null을 반환한다', async () => {
    const rows = [makeRow({ id: 'a', raw_data: { SVCOPNENDDT: '2026-12-31 00:00:00.0' } })];
    const client = makeFakeClient(rows);

    const result = await deleteExpiredReservationSpaces(client, { now: new Date('2026-09-05T00:00:00Z') });

    expect(result.deletedCount).toBe(0);
    expect(result.backupFile).toBeNull();
  });

  it('dryRun이면 삭제하지 않고 집계만 반환한다', async () => {
    const rows = [makeRow({ id: 'a', raw_data: { SVCOPNENDDT: '2026-08-31 00:00:00.0' } })];
    const client = makeFakeClient(rows);

    const result = await deleteExpiredReservationSpaces(client, { dryRun: true, now: new Date('2026-09-05T00:00:00Z') });

    expect(result.toDeleteCount).toBe(1);
    expect(client.deletedIds).toEqual([]);
  });
});
