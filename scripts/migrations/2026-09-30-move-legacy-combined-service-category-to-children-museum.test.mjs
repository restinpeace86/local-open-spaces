import { afterEach, describe, expect, it, vi } from 'vitest';

// [구 통합 노출중분류 '어린이 과학관 / 박물관' → 어린이박물관 이관] 검증.

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

describe('move-legacy-combined-service-category-to-children-museum run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 4건 전원에 category_min/category_min_source/service_category_id를 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-move-legacy-combined-service-category-to-children-museum.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이박물관',
      category_min_source: 'MANUAL',
      service_category_id: 'bc3b83df-b478-4620-9495-6499870bebdc',
    });
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('대상 ID 목록에 중복이 없고 정확히 4건이다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-move-legacy-combined-service-category-to-children-museum.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(4);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-move-legacy-combined-service-category-to-children-museum.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
