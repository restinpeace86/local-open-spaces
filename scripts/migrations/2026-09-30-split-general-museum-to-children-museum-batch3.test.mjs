import { afterEach, describe, expect, it, vi } from 'vitest';

// [종합/기타박물관 → 어린이박물관 추가 이관(batch3) + 노출중분류 매핑] 검증.

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

describe('split-general-museum-to-children-museum-batch3 run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 스팟 전원에 category_min/category_min_source/service_category_id를 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch3.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이박물관',
      category_min_source: 'MANUAL',
      service_category_id: 'bc3b83df-b478-4620-9495-6499870bebdc',
    });
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('번호가 매겨진 공룡 관련 놀이시설이 CSV의 정확한 이름별로 각각 매핑됐다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch3.mjs');
    expect(TARGET_SPOT_IDS).toContain('29797560-1a4b-4fea-81d5-5f570cd8cfc3'); // 공룡박물관 어린이놀이시설(별도 CSV 행)
    expect(TARGET_SPOT_IDS).toContain('f91075fb-3a91-48f8-84ab-f31b7f926e90'); // 공룡화석지 어린이놀이시설3
    expect(TARGET_SPOT_IDS).toContain('9661daf0-ab0e-469a-acfc-edab1dd36361'); // 공룡화석지 어린이놀이시설2
    expect(TARGET_SPOT_IDS).toContain('9ac0bba5-7f78-4c8b-853b-538c6f7ede1f'); // 공룡화석지 어린이놀이시설1
    expect(TARGET_SPOT_IDS).toContain('f3367401-52df-42a7-8be3-9c6668b7f076'); // 공룡사파리랜드 어린이놀이시설
  });

  it('의미 있게 다른 하위 시설은 CSV가 명시한 이름만 포함하고 명시하지 않은 후보는 제외한다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch3.mjs');
    // "고래박물관 내 어린이놀이시설"만 CSV에 있고, 일반 명칭 "장생포 고래박물관"은 없음
    expect(TARGET_SPOT_IDS).toContain('ce41a725-27cb-49e0-ac54-d8bfcd906bbf');
    expect(TARGET_SPOT_IDS).not.toContain('d1e791f4-c183-4f57-8f98-5fac8a2caca1');
    // "예천곤충생태원 앞 놀이시설"만 CSV에 있고, "실내놀이시설"은 없음
    expect(TARGET_SPOT_IDS).toContain('cabc6c5e-b4a0-423f-9daa-841368f64243');
    expect(TARGET_SPOT_IDS).not.toContain('33c5ef9f-3b12-437b-8358-cd87be8cf012');
    // "어린이 전시관 내 어린이 놀이시설(미끄럼틀)"만 CSV에 있고, "세계유교문화박물관"은 없음
    expect(TARGET_SPOT_IDS).toContain('86bd2ad3-9d2f-44f1-89db-1e23e882752c');
    expect(TARGET_SPOT_IDS).not.toContain('30582d83-95f8-4b62-9817-3568cefda60d');
    expect(TARGET_SPOT_IDS).not.toContain('2163008b-e9e6-4d88-9712-94947c7f6098');
  });

  it('CSV가 일반 박물관 본체 명칭 자체를 직접 명시한 경우(국립중앙박물관)는 포함한다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch3.mjs');
    expect(TARGET_SPOT_IDS).toContain('9b064db7-e8f2-44d7-9be3-a96a96084bba');
    expect(TARGET_SPOT_IDS).toContain('5e368fed-7005-4730-ab81-a38b49fb3da2');
    expect(TARGET_SPOT_IDS).toContain('ca5346af-5bc6-49fd-b830-3346ca9aa5cf');
    expect(TARGET_SPOT_IDS).toContain('796f1377-25a4-4d78-968a-3c7c93e6c26b');
  });

  it('대상 ID 목록에 중복이 없다(96건)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch3.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(96);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-general-museum-to-children-museum-batch3.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
