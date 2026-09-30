import { afterEach, describe, expect, it, vi } from 'vitest';

// [표준중분류 미지정 → LLM 분류 결과 검토 후 실제 이관(1차)] 검증.

function makeAdminClient(idsByCall) {
  let callIndex = 0;
  const updateCalls = [];
  const fromMock = vi.fn(() => ({
    update: (patch) => ({
      in: (_col, ids) => {
        updateCalls.push({ patch, ids });
        const returned = idsByCall ? idsByCall[callIndex] ?? ids : ids;
        callIndex += 1;
        return { select: () => Promise.resolve({ data: returned.map((id) => ({ id })), error: null }) };
      },
    }),
  }));
  return { fromMock, updateCalls };
}

describe('assign-unassigned-category-min-from-llm-batch1 run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('8개 표준중분류 각각에 해당 ID만 category_min/category_min_source로 반영한다', async () => {
    const { fromMock, updateCalls } = makeAdminClient();
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS_BY_CATEGORY } = await import('./2026-09-30-assign-unassigned-category-min-from-llm-batch1.mjs');
    await run();

    expect(updateCalls).toHaveLength(8);
    for (const call of updateCalls) {
      expect(call.patch).toHaveProperty('category_min_source', 'MANUAL');
      expect(TARGET_SPOT_IDS_BY_CATEGORY[call.patch.category_min]).toEqual(call.ids);
    }
    // service_category_id는 이번 지시에 없어 건드리지 않는다.
    for (const call of updateCalls) expect(call.patch).not.toHaveProperty('service_category_id');
  });

  it('공공키즈카페 대상 2건은 키즈카페로, 테마파크 대상 1건은 관광명소로 대체 이관된다', async () => {
    const { TARGET_SPOT_IDS_BY_CATEGORY } = await import('./2026-09-30-assign-unassigned-category-min-from-llm-batch1.mjs');
    expect(TARGET_SPOT_IDS_BY_CATEGORY['키즈카페']).toContain('286bfb2a-f486-43a8-b9d8-52aee36c1674'); // 꿈틀어울림센터
    expect(TARGET_SPOT_IDS_BY_CATEGORY['키즈카페']).toContain('3e311c33-4950-4390-8e1a-4cdd32c4d847'); // 연제구 아이사랑뜰
    expect(TARGET_SPOT_IDS_BY_CATEGORY['관광명소']).toEqual(['fb9352f7-b555-49e6-bdb7-6e0157e737aa']); // 놀자숲
    expect(TARGET_SPOT_IDS_BY_CATEGORY).not.toHaveProperty('공공키즈카페');
    expect(TARGET_SPOT_IDS_BY_CATEGORY).not.toHaveProperty('테마파크');
  });

  it('같은 주소의 모호 후보 중 CSV와 정확히 이름이 일치하는 것만 포함한다(안성팜랜드)', async () => {
    const { TARGET_SPOT_IDS_BY_CATEGORY } = await import('./2026-09-30-assign-unassigned-category-min-from-llm-batch1.mjs');
    expect(TARGET_SPOT_IDS_BY_CATEGORY['교육농장']).toContain('40441f14-4145-4aed-b93c-0f44a5ec79c8'); // 농협경제지주(주) 안성팜랜드
    expect(TARGET_SPOT_IDS_BY_CATEGORY['교육농장']).not.toContain('62394e42-10fc-4ab3-b8b3-d9afa995c517'); // 제이에스 산업개발(주)
  });

  it('대상 ID 목록에 중복이 없고 총 33건이다', async () => {
    const { TARGET_SPOT_IDS } = await import('./2026-09-30-assign-unassigned-category-min-from-llm-batch1.mjs');
    expect(new Set(TARGET_SPOT_IDS).size).toBe(TARGET_SPOT_IDS.length);
    expect(TARGET_SPOT_IDS).toHaveLength(33);
  });

  it('실제 갱신된 건수와 대상 건수를 함께 반환한다', async () => {
    const { fromMock } = makeAdminClient();
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, TARGET_SPOT_IDS } = await import('./2026-09-30-assign-unassigned-category-min-from-llm-batch1.mjs');
    const result = await run();

    expect(result).toEqual({ updatedCount: TARGET_SPOT_IDS.length, targetCount: TARGET_SPOT_IDS.length });
  });
});
