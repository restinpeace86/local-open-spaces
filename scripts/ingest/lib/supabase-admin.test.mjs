// upsertRows()의 external_id 중복 제거 방어 로직 단위 테스트 (2026-08-21 추가)
// 배경: GgEventsAdapter의 원본 데이터(TBWTRWTRPLYHYDRDTAM)에 완전히 동일한 시설명+주소
// 레코드가 두 건 중복 등재돼 있어, 동일 external_id(SHA1 해시)를 가진 두 행이 같은 upsert
// 배치에 섞여 들어가면서 Postgres가 "ON CONFLICT DO UPDATE command cannot affect row a
// second time"로 배치 전체를 거부하는 실제 오류를 겪었다. 이 방어는 어떤 어댑터든 원본에
// 완전 중복 레코드가 섞여 있을 수 있는 일반적인 경우라 공용 upsertRows에 둔다.
import { describe, expect, it, vi } from 'vitest';
import { upsertRows } from './supabase-admin.mjs';

function makeMockClient() {
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ upsert }));
  return { client: { from }, upsert, from };
}

describe('upsertRows', () => {
  it('행이 없으면 upsert를 호출하지 않고 count 0을 반환한다', async () => {
    const { client, upsert } = makeMockClient();
    const result = await upsertRows(client, 'open_spaces', []);
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0 });
  });

  it('external_id가 같은 행이 여러 개면 하나로 합쳐 upsert를 한 번만 호출한다(마지막 값 우선)', async () => {
    const { client, upsert } = makeMockClient();
    const rows = [
      { external_id: 'A', name: '첫 번째' },
      { external_id: 'B', name: '유일' },
      { external_id: 'A', name: '두 번째(최종)' },
    ];

    const result = await upsertRows(client, 'open_spaces', rows);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toHaveLength(2);
    expect(sentRows.find((r) => r.external_id === 'A')).toEqual({ external_id: 'A', name: '두 번째(최종)' });
    expect(result).toEqual({ count: 2 });
  });

  it('중복이 없으면 그대로 전달한다', async () => {
    const { client, upsert } = makeMockClient();
    const rows = [
      { external_id: 'A', name: '가' },
      { external_id: 'B', name: '나' },
    ];

    const result = await upsertRows(client, 'open_spaces', rows);

    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toHaveLength(2);
    expect(result).toEqual({ count: 2 });
  });

  it('onConflict 옵션을 external_id로 지정해 호출한다', async () => {
    const { client, upsert, from } = makeMockClient();
    await upsertRows(client, 'events', [{ external_id: 'A' }]);

    expect(from).toHaveBeenCalledWith('events');
    expect(upsert).toHaveBeenCalledWith(expect.anything(), { onConflict: 'external_id' });
  });

  it('upsert가 에러를 반환하면 테이블명을 포함한 에러를 던진다', async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: { message: 'boom' } }));
    const client = { from: vi.fn(() => ({ upsert })) };

    await expect(upsertRows(client, 'open_spaces', [{ external_id: 'A' }])).rejects.toThrow(
      'open_spaces upsert 실패: boom'
    );
  });
});
