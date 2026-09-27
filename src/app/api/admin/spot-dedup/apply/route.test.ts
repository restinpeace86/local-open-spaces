import { afterEach, describe, expect, it, vi } from 'vitest';

// [그룹 병합 시 naver_place_id 자동 이전](2026-09-27 사용자 지시, "어뮤즈스파
// 진주점" 사례): "그룹병합한 후에 안보이게 되고 그룹병합후 해서 채우면 보이면
// 돼. 혹은 둘중에 값 있던 것으로 나머지 그룹병합된것도 채워줘도 되고" —
// naver_place_id는 unique 제약이 있어 여러 행에 동시에 같은 값을 채울 수 없다.
// spot-curations/route.test.ts와 동일한 관례(vi.doMock + 동적 import).

type MemberRow = {
  id: string;
  created_at: string;
  naver_place_id: string | null;
  excluded_weekdays?: string[] | null;
  excluded_nth_weekdays?: string[] | null;
};

function mockAdminClient({
  memberRows,
  groupInsertError = null as { message: string } | null,
}: {
  memberRows: MemberRow[];
  groupInsertError?: { message: string } | null;
}) {
  const updateCalls: Array<{ patch: Record<string, unknown>; target: { in?: string[]; eq?: string } }> = [];

  function makeUpdateChain(patch: Record<string, unknown>) {
    return {
      in: (_col: string, ids: string[]) => {
        updateCalls.push({ patch, target: { in: ids } });
        return { select: () => Promise.resolve({ data: ids.map((id) => ({ id })), error: null }) };
      },
      eq: (_col: string, id: string) => {
        updateCalls.push({ patch, target: { eq: id } });
        return Promise.resolve({ error: null });
      },
    };
  }
  const updateMock = vi.fn((patch: Record<string, unknown>) => makeUpdateChain(patch));

  const groupInsertMock = vi.fn(() => ({
    select: () => ({
      single: () => Promise.resolve({ data: groupInsertError ? null : { id: 'group-1' }, error: groupInsertError }),
    }),
  }));
  const deleteMock = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));

  const fromMock = vi.fn((table: string) => {
    if (table === 'open_spaces') {
      return { select: () => ({ in: () => Promise.resolve({ data: memberRows, error: null }) }), update: updateMock };
    }
    if (table === 'spot_dedup_groups') return { insert: groupInsertMock };
    if (table === 'spot_dedup_pending_groups') return { delete: deleteMock };
    throw new Error(`unexpected table: ${table}`);
  });

  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));
  return { updateCalls };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/admin/spot-dedup/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/spot-dedup/apply — naver_place_id 자동 이전', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('대표는 값이 없고 비대표 멤버 하나가 값을 갖고 있으면 대표로 옮기고 비대표는 비운다', async () => {
    // spot-2가 더 이른 created_at이라 대표가 된다(기존 규약: created_at 오름차순).
    const { updateCalls } = mockAdminClient({
      memberRows: [
        { id: 'spot-1', created_at: '2026-09-02T00:00:00.000Z', naver_place_id: '1688445701' },
        { id: 'spot-2', created_at: '2026-09-01T00:00:00.000Z', naver_place_id: null },
      ],
    });
    const { POST } = await import('./route');

    const res = await POST(
      makeRequest({ spot_ids: ['spot-1', 'spot-2'], standard_name: '어뮤즈스파 진주점' }) as never
    );
    expect(res.status).toBe(200);

    const clearCall = updateCalls.find((c) => c.target.eq === 'spot-1' && 'naver_place_id' in c.patch);
    expect(clearCall?.patch).toEqual({ naver_place_id: null });

    const migrateCall = updateCalls.find((c) => c.target.eq === 'spot-2' && c.patch.naver_place_id === '1688445701');
    expect(migrateCall).toBeDefined();

    // 비우는 게 옮기는 것보다 먼저 실행돼야 한다(동시에 같은 값을 두 행이 갖는
    // 순간을 만들지 않기 위해 — unique 제약 위반 방지).
    const clearIndex = updateCalls.indexOf(clearCall!);
    const migrateIndex = updateCalls.indexOf(migrateCall!);
    expect(clearIndex).toBeLessThan(migrateIndex);
  });

  it('대표가 이미 값을 갖고 있으면 아무것도 옮기지 않는다', async () => {
    const { updateCalls } = mockAdminClient({
      memberRows: [
        { id: 'spot-1', created_at: '2026-09-01T00:00:00.000Z', naver_place_id: '1111111111' },
        { id: 'spot-2', created_at: '2026-09-02T00:00:00.000Z', naver_place_id: '2222222222' },
      ],
    });
    const { POST } = await import('./route');

    await POST(makeRequest({ spot_ids: ['spot-1', 'spot-2'], standard_name: '테스트' }) as never);

    expect(updateCalls.some((c) => 'naver_place_id' in c.patch)).toBe(false);
  });

  it('아무 멤버도 naver_place_id가 없으면 아무것도 옮기지 않는다', async () => {
    const { updateCalls } = mockAdminClient({
      memberRows: [
        { id: 'spot-1', created_at: '2026-09-01T00:00:00.000Z', naver_place_id: null },
        { id: 'spot-2', created_at: '2026-09-02T00:00:00.000Z', naver_place_id: null },
      ],
    });
    const { POST } = await import('./route');

    await POST(makeRequest({ spot_ids: ['spot-1', 'spot-2'], standard_name: '테스트' }) as never);

    expect(updateCalls.some((c) => 'naver_place_id' in c.patch)).toBe(false);
  });

  it('서로 다른 값을 가진 멤버가 둘 이상이면(진짜 충돌) 추측으로 옮기지 않는다', async () => {
    const { updateCalls } = mockAdminClient({
      memberRows: [
        { id: 'spot-1', created_at: '2026-09-01T00:00:00.000Z', naver_place_id: null },
        { id: 'spot-2', created_at: '2026-09-02T00:00:00.000Z', naver_place_id: '1111111111' },
        { id: 'spot-3', created_at: '2026-09-03T00:00:00.000Z', naver_place_id: '2222222222' },
      ],
    });
    const { POST } = await import('./route');

    const res = await POST(
      makeRequest({ spot_ids: ['spot-1', 'spot-2', 'spot-3'], standard_name: '테스트' }) as never
    );
    expect(res.status).toBe(200);
    expect(updateCalls.some((c) => 'naver_place_id' in c.patch)).toBe(false);
  });
});

// [어린이도서관 중복 스팟 그룹 — 정기휴관일 통합](2026-09-28 사용자 지시): "정기휴관일
// 관련하여서도 둘중 하나가 값이 있으면 있는것 기준으로 통합되게 해줘.. 동일한
// 그룹내 빈쪽에도 동일하게 채워주던가" — naver_place_id와 달리 대표뿐 아니라
// 그룹 전원(spotIds 배치 업데이트)에 같은 값을 채운다.
describe('POST /api/admin/spot-dedup/apply — 정기휴관일(excluded_weekdays) 통합', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('한 멤버만 excluded_weekdays가 있으면 그룹 전원에 같은 값을 채운다', async () => {
    const { updateCalls } = mockAdminClient({
      memberRows: [
        { id: 'spot-1', created_at: '2026-09-01T00:00:00.000Z', naver_place_id: null, excluded_weekdays: null },
        { id: 'spot-2', created_at: '2026-09-02T00:00:00.000Z', naver_place_id: null, excluded_weekdays: ['MON'] },
      ],
    });
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ spot_ids: ['spot-1', 'spot-2'], standard_name: '테스트' }) as never);
    expect(res.status).toBe(200);

    const batchCall = updateCalls.find((c) => c.target.in?.length === 2);
    expect(batchCall?.patch.excluded_weekdays).toEqual(['MON']);
  });

  it('서로 다른 값이 섞여 있으면(진짜 충돌) 추측으로 합치지 않는다', async () => {
    const { updateCalls } = mockAdminClient({
      memberRows: [
        { id: 'spot-1', created_at: '2026-09-01T00:00:00.000Z', naver_place_id: null, excluded_weekdays: ['MON'] },
        { id: 'spot-2', created_at: '2026-09-02T00:00:00.000Z', naver_place_id: null, excluded_weekdays: ['TUE'] },
      ],
    });
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ spot_ids: ['spot-1', 'spot-2'], standard_name: '테스트' }) as never);
    expect(res.status).toBe(200);

    const batchCall = updateCalls.find((c) => c.target.in?.length === 2);
    expect(batchCall?.patch.excluded_weekdays).toBeUndefined();
  });

  it('excluded_nth_weekdays도 동일하게 동작한다', async () => {
    const { updateCalls } = mockAdminClient({
      memberRows: [
        { id: 'spot-1', created_at: '2026-09-01T00:00:00.000Z', naver_place_id: null, excluded_nth_weekdays: ['2-MON'] },
        { id: 'spot-2', created_at: '2026-09-02T00:00:00.000Z', naver_place_id: null, excluded_nth_weekdays: null },
      ],
    });
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ spot_ids: ['spot-1', 'spot-2'], standard_name: '테스트' }) as never);
    expect(res.status).toBe(200);

    const batchCall = updateCalls.find((c) => c.target.in?.length === 2);
    expect(batchCall?.patch.excluded_nth_weekdays).toEqual(['2-MON']);
  });

  it('아무도 값이 없으면 그 필드를 업데이트 대상에서 아예 뺀다', async () => {
    const { updateCalls } = mockAdminClient({
      memberRows: [
        { id: 'spot-1', created_at: '2026-09-01T00:00:00.000Z', naver_place_id: null },
        { id: 'spot-2', created_at: '2026-09-02T00:00:00.000Z', naver_place_id: null },
      ],
    });
    const { POST } = await import('./route');

    await POST(makeRequest({ spot_ids: ['spot-1', 'spot-2'], standard_name: '테스트' }) as never);

    const batchCall = updateCalls.find((c) => c.target.in?.length === 2);
    expect(batchCall?.patch).not.toHaveProperty('excluded_weekdays');
    expect(batchCall?.patch).not.toHaveProperty('excluded_nth_weekdays');
  });
});
