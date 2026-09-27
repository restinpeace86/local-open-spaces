import { describe, expect, it } from 'vitest';
import { computeNextReservationOpenAt, refreshKidsCafeReservationOpenAt } from './kids-cafe-reservation-rule.mjs';

// [예약 오픈 알림 — 공공키즈카페/서울형키즈카페 자동 주간 재계산](2026-09-27 사용자
// 지시): "이거는 일단 매주 발생하는거니깐 예약시간을 규칙안내화면과 같이 매주
// 화요일로 해줄래?" — admin 참고표(RESERVATION_OPEN_RULE_REFERENCE)와 정확히
// 같은 값이 나오는지, 그리고 배치가 값이 실제로 바뀔 때만 UPDATE하는지 검증한다.

describe('computeNextReservationOpenAt', () => {
  it('공공키즈카페: 강남구(1그룹, 화요일 09시)의 다음 오픈 시각을 계산한다', () => {
    const now = new Date('2026-09-27T00:00:00Z'); // KST 일요일
    expect(computeNextReservationOpenAt('공공키즈카페', '서울시 강남구', now)).toBe('2026-09-29T00:00:00.000Z');
  });

  it('서울형키즈카페: 마포구(오감놀이터, 월요일 10시)의 다음 오픈 시각을 계산한다', () => {
    const now = new Date('2026-09-27T00:00:00Z');
    expect(computeNextReservationOpenAt('서울형키즈카페', '서울시 마포구', now)).toBe('2026-09-28T01:00:00.000Z');
  });

  it('이미 이번 주 오픈 시각이 지났으면 다음 주로 넘어간다(추측 없이 순수 날짜 계산)', () => {
    const now = new Date('2026-09-22T00:30:00Z'); // KST 화요일 09:30(1그룹 09:00 이미 지남)
    expect(computeNextReservationOpenAt('공공키즈카페', '서울시 강남구', now)).toBe('2026-09-29T00:00:00.000Z');
  });

  it('규칙 범위 밖 자치구면 null(추측으로 채우지 않음)', () => {
    const now = new Date('2026-09-27T00:00:00Z');
    expect(computeNextReservationOpenAt('공공키즈카페', '서울시 어딘가구', now)).toBeNull();
  });

  it('공공키즈카페/서울형키즈카페가 아닌 카테고리는 null', () => {
    expect(computeNextReservationOpenAt('기타카테고리', '서울시 강남구')).toBeNull();
  });

  it('sigungu_name이 없으면 null', () => {
    expect(computeNextReservationOpenAt('공공키즈카페', null)).toBeNull();
  });
});

function makeFakeClient(rows) {
  const updateCalls = [];
  const client = {
    from(table) {
      if (table !== 'events') throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          return {
            in(column, values) {
              return {
                range(from, to) {
                  const filtered = rows.filter((r) => values.includes(r.category_min));
                  const page = filtered.slice(from, to + 1).map((r) => ({ ...r }));
                  return Promise.resolve({ data: page, error: null });
                },
              };
            },
          };
        },
        update(patch) {
          return {
            eq(column, id) {
              updateCalls.push({ id, patch });
              const row = rows.find((r) => r.id === id);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client, updateCalls };
}

describe('refreshKidsCafeReservationOpenAt', () => {
  const now = new Date('2026-09-27T00:00:00Z');

  it('계산값이 현재 저장된 값과 다르면 next_reservation_open_at을 갱신하고 발송 기록을 리셋한다', async () => {
    const rows = [
      {
        id: 'ev-1',
        category_min: '공공키즈카페',
        sigungu_name: '서울시 강남구',
        next_reservation_open_at: '2026-09-22T00:00:00.000Z', // 지난 회차
      },
    ];
    const { client, updateCalls } = makeFakeClient(rows);

    const result = await refreshKidsCafeReservationOpenAt(client, now);

    expect(updateCalls).toEqual([
      {
        id: 'ev-1',
        patch: { next_reservation_open_at: '2026-09-29T00:00:00.000Z', reservation_open_reminder_sent_at: null },
      },
    ]);
    expect(result).toEqual({ scanned: 1, updated: 1, skipped: 0 });
  });

  it('계산값이 이미 저장된 값과 같으면(포맷만 다를 수 있음) 건드리지 않는다(발송 기록 보존)', async () => {
    const rows = [
      {
        id: 'ev-1',
        category_min: '공공키즈카페',
        sigungu_name: '서울시 강남구',
        // 같은 순간을 가리키는 다른 포맷(+00:00 vs .000Z) — 문자열이 아니라 실제 시각으로 비교해야 한다.
        next_reservation_open_at: '2026-09-29T00:00:00+00:00',
        reservation_open_reminder_sent_at: '2026-09-29T00:00:00.000Z',
      },
    ];
    const { client, updateCalls } = makeFakeClient(rows);

    const result = await refreshKidsCafeReservationOpenAt(client, now);

    expect(updateCalls).toEqual([]);
    expect(rows[0].reservation_open_reminder_sent_at).toBe('2026-09-29T00:00:00.000Z');
    expect(result).toEqual({ scanned: 1, updated: 0, skipped: 0 });
  });

  it('자치구를 특정할 수 없는 행은 건드리지 않고 스킵으로 집계한다', async () => {
    const rows = [
      { id: 'ev-1', category_min: '공공키즈카페', sigungu_name: null, next_reservation_open_at: null },
      { id: 'ev-2', category_min: '서울형키즈카페', sigungu_name: '서울시 어딘가구', next_reservation_open_at: null },
    ];
    const { client, updateCalls } = makeFakeClient(rows);

    const result = await refreshKidsCafeReservationOpenAt(client, now);

    expect(updateCalls).toEqual([]);
    expect(result).toEqual({ scanned: 2, updated: 0, skipped: 2 });
  });

  it('공공키즈카페/서울형키즈카페 외 카테고리는 조회 대상에서 제외한다', async () => {
    const rows = [
      { id: 'ev-1', category_min: '문화행사', sigungu_name: '서울시 강남구', next_reservation_open_at: null },
      {
        id: 'ev-2',
        category_min: '공공키즈카페',
        sigungu_name: '서울시 강남구',
        next_reservation_open_at: null,
      },
    ];
    const { client, updateCalls } = makeFakeClient(rows);

    const result = await refreshKidsCafeReservationOpenAt(client, now);

    expect(result.scanned).toBe(1);
    expect(updateCalls).toEqual([{ id: 'ev-2', patch: { next_reservation_open_at: '2026-09-29T00:00:00.000Z', reservation_open_reminder_sent_at: null } }]);
  });
});
