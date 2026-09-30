import { afterEach, describe, expect, it, vi } from 'vitest';

// [구 노출중분류 '미술관 / 전시체험관' 잔여 7건 정리 — 1차: 3건 이관] 검증.

function makeAdminClient(updatedIds) {
  const updateCalls = [];
  const fromMock = vi.fn(() => ({
    update: (patch) => ({
      in: (_col, ids) => {
        updateCalls.push({ patch, ids });
        return { select: () => Promise.resolve({ data: updatedIds.map((id) => ({ id })), error: null }) };
      },
    }),
  }));
  return { fromMock, updateCalls };
}

describe('add-legacy-art-exhibition-experience-to-children-category run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 3건 전원에 category_min/category_min_source/service_category_id를 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-add-legacy-art-exhibition-experience-to-children-category.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이전시미술관',
      category_min_source: 'MANUAL',
      service_category_id: '2901e5e0-55d5-4799-b18f-6ebe886e40ec',
    });
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('대상 ID 목록에 중복이 없고 정확히 3건이다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-add-legacy-art-exhibition-experience-to-children-category.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(3);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-add-legacy-art-exhibition-experience-to-children-category.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
