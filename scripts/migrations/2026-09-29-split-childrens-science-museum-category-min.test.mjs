import { afterEach, describe, expect, it, vi } from 'vitest';

// [순수 어린이과학관 표준 중분류 이관 + 노출중분류 매핑] 검증: 대상 ID들에만
// category_min/category_min_source/service_category_id가 갱신되는지 확인한다.

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

describe('split-childrens-science-museum-category-min run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 스팟 전원에 category_min/category_min_source/service_category_id를 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-29-split-childrens-science-museum-category-min.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이과학관',
      category_min_source: 'MANUAL',
      service_category_id: '34c758dd-e55c-4dea-bece-e5ab91f6138f',
    });
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('대상 목록에는 미병합 중복(같은 주소 후보 2~3건)의 모든 후보가 포함된다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-29-split-childrens-science-museum-category-min.mjs');
    // 서대문자연사박물관 3건 후보가 전부 포함됐는지 확인.
    expect(TARGET_SPOT_IDS).toContain('0f266b3a-d345-4f11-a5e0-9d168b544024');
    expect(TARGET_SPOT_IDS).toContain('40e87dff-8b59-496a-bcb2-04c75d131a3b');
    expect(TARGET_SPOT_IDS).toContain('b20cd182-d351-49da-8433-54cbb728280d');
  });

  it('대상 ID 목록에 중복이 없다(69건)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-29-split-childrens-science-museum-category-min.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(69);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-29-split-childrens-science-museum-category-min.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
