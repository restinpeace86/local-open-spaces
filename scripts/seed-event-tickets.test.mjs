// [이벤트픽 & 티켓 할인 정보 MVP](2026-08-29 사용자 지시) 단위 테스트: seedEventTickets의
// 멱등성(이미 데이터가 있으면 삽입하지 않음)을 확인한다.
import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_EVENT_TICKETS, seedEventTickets } from './seed-event-tickets.mjs';

function makeFakeClient({ existingCount, insertResult = { error: null } }) {
  const insert = vi.fn(() => Promise.resolve(insertResult));
  const client = {
    from: () => ({
      select: () => Promise.resolve({ count: existingCount, error: null }),
      insert,
    }),
  };
  return { client, insert };
}

describe('seedEventTickets', () => {
  it('테이블이 비어 있으면 샘플 데이터를 전부 삽입한다', async () => {
    const { client, insert } = makeFakeClient({ existingCount: 0 });
    const result = await seedEventTickets(client);

    expect(result).toEqual({ inserted: SAMPLE_EVENT_TICKETS.length, skipped: false });
    expect(insert).toHaveBeenCalledWith(SAMPLE_EVENT_TICKETS);
  });

  it('이미 데이터가 있으면 삽입하지 않는다(멱등)', async () => {
    const { client, insert } = makeFakeClient({ existingCount: 3 });
    const result = await seedEventTickets(client);

    expect(result).toEqual({ inserted: 0, skipped: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it('삽입 실패 시 명확한 에러를 던진다', async () => {
    const { client } = makeFakeClient({ existingCount: 0, insertResult: { error: { message: 'DB 오류' } } });
    await expect(seedEventTickets(client)).rejects.toThrow('event_tickets 샘플 삽입 실패: DB 오류');
  });
});
