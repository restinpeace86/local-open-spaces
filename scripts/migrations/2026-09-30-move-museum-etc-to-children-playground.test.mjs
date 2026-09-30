import { afterEach, describe, expect, it, vi } from 'vitest';

// [종합/기타박물관 → 어린이놀이터 표준중분류 이관] 검증.

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

describe('move-museum-etc-to-children-playground run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 스팟 전원에 category_min/category_min_source만 반영하고 service_category_id는 건드리지 않는다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-move-museum-etc-to-children-playground.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이놀이터',
      category_min_source: 'MANUAL',
    });
    expect(updateCalls[0].patch).not.toHaveProperty('service_category_id');
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('대상 ID 목록에 중복이 없다(25건)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-move-museum-etc-to-children-playground.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(25);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-move-museum-etc-to-children-playground.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
