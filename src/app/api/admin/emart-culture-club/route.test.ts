import { afterEach, describe, expect, it, vi } from 'vitest';

// [이마트 컬처클럽 수동 노출 제외](2026-10-03 사용자 지시): "화면에 노출 배제할꺼
// 수동으로 체크할수 있어?" — PATCH 핸들러가 class_id로 is_excluded를 정확히
// 업데이트하는지, 필수 파라미터 누락 시 400을 반환하는지 검증한다.
function makeUpdateBuilder(result: { error: { message: string } | null }) {
  const calls: { update?: Record<string, unknown>; eq?: [string, unknown] } = {};
  const builder: Record<string, unknown> = {};
  builder.update = (payload: Record<string, unknown>) => {
    calls.update = payload;
    return builder;
  };
  builder.eq = (column: string, value: unknown) => {
    calls.eq = [column, value];
    return Promise.resolve(result);
  };
  return { builder, calls };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/admin/emart-culture-club', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as never;
}

describe('PATCH /api/admin/emart-culture-club', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
  });

  it('class_id/is_excluded로 해당 행을 업데이트한다', async () => {
    const { builder, calls } = makeUpdateBuilder({ error: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ class_id: 'abc123', is_excluded: true }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(calls.update).toEqual({ is_excluded: true });
    expect(calls.eq).toEqual(['class_id', 'abc123']);
  });

  it('class_id가 없으면 400을 반환한다', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => makeUpdateBuilder({ error: null }).builder }) }));

    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ is_excluded: true }));

    expect(res.status).toBe(400);
  });

  it('is_excluded가 boolean이 아니면 400을 반환한다', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => makeUpdateBuilder({ error: null }).builder }) }));

    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ class_id: 'abc123', is_excluded: 'yes' }));

    expect(res.status).toBe(400);
  });

  it('DB 업데이트가 실패하면 500을 반환한다', async () => {
    const { builder } = makeUpdateBuilder({ error: { message: 'db down' } });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder }) }));

    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ class_id: 'abc123', is_excluded: true }));

    expect(res.status).toBe(500);
  });
});
