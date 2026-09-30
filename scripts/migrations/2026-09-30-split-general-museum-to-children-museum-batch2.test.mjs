import { afterEach, describe, expect, it, vi } from 'vitest';

// [종합/기타박물관 → 어린이박물관 추가 이관(batch2) + 노출중분류 매핑] 검증.

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

describe('split-general-museum-to-children-museum-batch2 run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 스팟 전원에 category_min/category_min_source/service_category_id를 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch2.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이박물관',
      category_min_source: 'MANUAL',
      service_category_id: 'bc3b83df-b478-4620-9495-6499870bebdc',
    });
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('경기북부어린이박물관 관련 4개 하위 시설이 각각 정확히 하나씩 매핑됐다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch2.mjs');
    expect(TARGET_SPOT_IDS).toContain('df09af86-3371-49c4-8e48-4ea328e5bc16'); // 경기북부어린이박물관(본체)
    expect(TARGET_SPOT_IDS).toContain('807154da-2449-4016-bb6d-dfc58929162e'); // 실내놀이터(공룡클라이머)
    expect(TARGET_SPOT_IDS).toContain('cf63e864-047e-4e9b-8a1f-3624adf4ee1d'); // 실외놀이터(기타놀이시설)
    expect(TARGET_SPOT_IDS).toContain('adfc86f3-6f2a-4419-8c47-126a2acb857a'); // 실외놀이터
  });

  it('일반 박물관 본체는 제외하고 어린이박물관 전용 코너만 포함한다(국립중앙박물관/국립청주박물관)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch2.mjs');
    expect(TARGET_SPOT_IDS).toContain('1132363d-497c-4c3e-8ad9-3d1ae140ed18'); // 국립중앙박물관 어린이박물관
    expect(TARGET_SPOT_IDS).not.toContain('9b064db7-e8f2-44d7-9be3-a96a96084bba'); // 국립중앙박물관(일반)
    expect(TARGET_SPOT_IDS).not.toContain('5e368fed-7005-4730-ab81-a38b49fb3da2'); // 국립중앙박물관(일반, 중복)
    expect(TARGET_SPOT_IDS).toContain('6590c07a-47e1-4d31-98e2-68a5e438a1fc'); // 국립청주박물관 어린이박물관
  });

  it('대상 ID 목록에 중복이 없다(117건)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch2.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(117);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch2.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
