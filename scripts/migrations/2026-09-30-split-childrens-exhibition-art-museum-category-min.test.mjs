import { afterEach, describe, expect, it, vi } from 'vitest';

// [순수 어린이전시미술관 표준 중분류 분리] 검증.

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

describe('split-childrens-exhibition-art-museum-category-min run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('대상 스팟 전원에 category_min/category_min_source/service_category_id를 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient(['id-1', 'id-2']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-exhibition-art-museum-category-min.mjs');
    await run();

    expect(updateCalls[0].patch).toEqual({
      category_min: '어린이전시미술관',
      category_min_source: 'MANUAL',
      service_category_id: '2901e5e0-55d5-4799-b18f-6ebe886e40ec',
    });
    expect(updateCalls[0].ids).toEqual(TARGET_SPOT_IDS);
  });

  it('같은 부지의 서로 다른 두 시설이 CSV의 각 정확한 이름으로 각각 매핑됐다(북서울꿈의숲)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-exhibition-art-museum-category-min.mjs');
    expect(TARGET_SPOT_IDS).toContain('551f6cfc-d12d-4fbe-a06c-9fdd5496cabb'); // 북서울꿈의숲 상상톡톡미술관
    expect(TARGET_SPOT_IDS).toContain('62dd9b8f-1a3d-437d-9817-27af723c7de4'); // 북서울꿈의숲아트센터 드림갤러리
  });

  it('CSV가 명시하지 않은 다른 이름의 후보는 제외한다(유리섬미술관/또봇정크아트뮤지엄/조선해양문화관)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-exhibition-art-museum-category-min.mjs');
    expect(TARGET_SPOT_IDS).toContain('43678bf8-657b-4fb9-bda6-3ccb5e693176'); // 유리섬미술관
    expect(TARGET_SPOT_IDS).not.toContain('e4298ab2-31e8-469a-b9fb-de3953cf7c7c'); // 맥아트미술관(CSV에 없음)
    expect(TARGET_SPOT_IDS).toContain('43cfdb0b-9747-4649-a0d3-5d4b949de48c'); // 또봇정크아트뮤지엄
    expect(TARGET_SPOT_IDS).not.toContain('eb3aeb08-3e66-48bf-8398-30ff2abe2c56'); // 경주솔거미술관(CSV에 없음)
    expect(TARGET_SPOT_IDS).toContain('0af9e9d6-c62e-458b-b258-dc950f01623a'); // 조선해양문화관(정확 일치, 중복 2건 중 1)
    expect(TARGET_SPOT_IDS).toContain('5919d285-8646-4421-bca9-ae2e4f4b4614'); // 조선해양문화관(정확 일치, 중복 2건 중 2)
    expect(TARGET_SPOT_IDS).not.toContain('b9c7ba79-2d35-4884-a784-23ed31e17941'); // 거제어촌민속전시관(CSV에 없음)
    expect(TARGET_SPOT_IDS).not.toContain('17d09adc-bf65-45bc-8c57-e8364728a5b0'); // 거제어촌민속전시관(CSV에 없음)
  });

  it('대상 ID 목록에 중복이 없다(85건)', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-exhibition-art-museum-category-min.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(85);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient(['id-1']);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-split-childrens-exhibition-art-museum-category-min.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: 1, targetCount: TARGET_SPOT_IDS.length });
  });
});
