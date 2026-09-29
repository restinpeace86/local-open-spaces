import { afterEach, describe, expect, it, vi } from 'vitest';

// [순수 어린이박물관 표준 중분류 이관 + 노출중분류 매핑] 검증.

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

describe('split-childrens-museum-category-min run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 스팟 전원에 category_min/category_min_source/service_category_id를 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-museum-category-min.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이박물관',
      category_min_source: 'MANUAL',
      service_category_id: 'bc3b83df-b478-4620-9495-6499870bebdc',
    });
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('전쟁기념관(3건 미병합 중복)의 모든 후보가 대상 목록에 포함된다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-museum-category-min.mjs');
    expect(TARGET_SPOT_IDS).toContain('928b8073-3528-41bc-82fc-5e45a85ace39');
    expect(TARGET_SPOT_IDS).toContain('a7dcad5e-2073-47ac-884e-2062ff070df3');
    expect(TARGET_SPOT_IDS).toContain('6a16b4fb-2820-4223-b2ac-c0c4fa3d8bee');
  });

  it('독립기념관의 "단풍나무숲길" 후보는 근거 부족으로 제외됐다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-museum-category-min.mjs');
    expect(TARGET_SPOT_IDS).not.toContain('e4cff08d-74ec-4856-9730-af2181603df0');
    expect(TARGET_SPOT_IDS).toContain('9f22bd24-57f7-4eaf-8e37-2909950a7d42');
  });

  it('대상 ID 목록에 중복이 없다(56건)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-museum-category-min.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(56);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-museum-category-min.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
