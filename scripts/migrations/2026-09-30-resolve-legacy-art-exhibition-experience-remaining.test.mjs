import { afterEach, describe, expect, it, vi } from 'vitest';

// [구 노출중분류 '미술관 / 전시체험관' 잔여 7건 정리 — 2차: 나머지 2건] 검증.

function makeAdminClient() {
  const updateCalls = [];
  const fromMock = vi.fn(() => ({
    update: (patch) => ({
      eq: (_col, id) => {
        updateCalls.push({ patch, id });
        return { select: () => Promise.resolve({ data: [{ id }], error: null }) };
      },
    }),
  }));
  return { fromMock, updateCalls };
}

describe('resolve-legacy-art-exhibition-experience-remaining run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('서울시립 미술아카이브는 표준중분류를 일반 미술관으로, 노출중분류는 null로 바꾼다', async () => {
    const { fromMock, updateCalls } = makeAdminClient();
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-30-resolve-legacy-art-exhibition-experience-remaining.mjs');
    await run();

    const artMuseumCall = updateCalls.find((c) => c.id === 'a59dc0ab-6b13-4080-a00f-351ffc1ab068');
    expect(artMuseumCall.patch).toEqual({
      category_min: '미술관',
      category_min_source: 'MANUAL',
      service_category_id: null,
    });
  });

  it('서울시어울림플라자는 표준중분류를 건드리지 않고 노출중분류만 null로 해제한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient();
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-30-resolve-legacy-art-exhibition-experience-remaining.mjs');
    await run();

    const plazaCall = updateCalls.find((c) => c.id === '88a74aa9-7076-4bab-91cc-02ae67215efe');
    expect(plazaCall.patch).toEqual({ service_category_id: null });
    expect(plazaCall.patch).not.toHaveProperty('category_min');
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient();
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-30-resolve-legacy-art-exhibition-experience-remaining.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 2, targetCount: 2 });
  });
});
