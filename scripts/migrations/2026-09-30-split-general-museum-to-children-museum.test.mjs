import { afterEach, describe, expect, it, vi } from 'vitest';

// [종합/기타박물관 → 어린이박물관 추가 이관 + 노출중분류 매핑] 검증.

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

describe('split-general-museum-to-children-museum run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 스팟 전원에 category_min/category_min_source/service_category_id를 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이박물관',
      category_min_source: 'MANUAL',
      // 2026-09-30 역사박물관 분리와 동일한 노출중분류(어린이 박물관)로 모인다.
      service_category_id: 'bc3b83df-b478-4620-9495-6499870bebdc',
    });
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('번호가 다른 개별 놀이시설(-2)은 CSV에 없던 것이라 대상에서 제외됐다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum.mjs');
    // 부산과학관 어린이놀이터-3(포함)과 같은 주소의 -2(미포함)를 구분.
    expect(TARGET_SPOT_IDS).toContain('07e70a17-b043-414d-9a99-9cae77bc5dbc'); // -3
    expect(TARGET_SPOT_IDS).not.toContain('361a0eef-9ca4-4924-b259-915137ff553d'); // -2
  });

  it('같은 부지의 별도 기관("경기도박물관")은 대상에서 제외됐다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum.mjs');
    expect(TARGET_SPOT_IDS).toContain('ed8ff8ca-dabf-4ae1-a5cf-375dca4822e2'); // 경기도어린이박물관
    expect(TARGET_SPOT_IDS).not.toContain('f74d56c1-700d-4e97-9103-d20e989043ff'); // 경기도박물관
  });

  it('대상 ID 목록에 중복이 없다(123건)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(123);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
