import { afterEach, describe, expect, it, vi } from 'vitest';

// [open_spaces 정기휴무 설정](2026-09-27 사용자 지시) — events의 operating-schedule
// 라우트와 동일한 관례(vi.doMock + 동적 import, spot-curations/route.test.ts 참고).

function mockAdminClient() {
  const updateCalls: Array<{ patch: Record<string, unknown>; id: string }> = [];
  const fromMock = vi.fn(() => ({
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => {
        updateCalls.push({ patch, id });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id, ...patch }, error: null }),
          }),
        };
      },
    }),
  }));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));
  return { updateCalls };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/admin/open-spaces/operating-schedule', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/admin/open-spaces/operating-schedule', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('excluded_weekdays/excluded_nth_weekdays를 정상 저장한다', async () => {
    const { updateCalls } = mockAdminClient();
    const { PATCH } = await import('./route');

    const res = await PATCH(
      makeRequest({ id: 'space-1', excluded_weekdays: ['MON'], excluded_nth_weekdays: ['1-TUE', '3-TUE'] }) as never
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(updateCalls).toEqual([
      { id: 'space-1', patch: { excluded_weekdays: ['MON'], excluded_nth_weekdays: ['1-TUE', '3-TUE'] } },
    ]);
    expect(data.row).toEqual({ id: 'space-1', excluded_weekdays: ['MON'], excluded_nth_weekdays: ['1-TUE', '3-TUE'] });
  });

  it('빈 배열은 null로 정규화한다', async () => {
    const { updateCalls } = mockAdminClient();
    const { PATCH } = await import('./route');

    await PATCH(makeRequest({ id: 'space-1', excluded_weekdays: [], excluded_nth_weekdays: [] }) as never);

    expect(updateCalls).toEqual([
      { id: 'space-1', patch: { excluded_weekdays: null, excluded_nth_weekdays: null } },
    ]);
  });

  it('id가 없으면 400', async () => {
    mockAdminClient();
    const { PATCH } = await import('./route');

    const res = await PATCH(makeRequest({ excluded_weekdays: ['MON'] }) as never);
    expect(res.status).toBe(400);
  });

  it('excluded_weekdays에 잘못된 요일 코드가 있으면 400', async () => {
    mockAdminClient();
    const { PATCH } = await import('./route');

    const res = await PATCH(makeRequest({ id: 'space-1', excluded_weekdays: ['MONDAY'] }) as never);
    expect(res.status).toBe(400);
  });

  it('excluded_nth_weekdays 형식이 잘못되면 400', async () => {
    mockAdminClient();
    const { PATCH } = await import('./route');

    const res = await PATCH(makeRequest({ id: 'space-1', excluded_nth_weekdays: ['MON'] }) as never);
    expect(res.status).toBe(400);
  });
});
