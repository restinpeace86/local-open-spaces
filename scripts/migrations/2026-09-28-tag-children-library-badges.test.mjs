import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// [어린이도서관 표준 뱃지 태깅] 검증: 원문 근거로 확정한 뱃지만 "추가"하고, 기존에
// 이미 있던 값(parking/kids_chair 등)은 지우지 않는지 확인한다.

function makeAdminClient(existingBySpot) {
  const upserts = [];
  const fromMock = vi.fn(() => ({
    select: () => ({
      eq: (_col, spotId) => ({
        maybeSingle: () =>
          Promise.resolve({
            data: existingBySpot[spotId] ? { curation_badges: existingBySpot[spotId] } : null,
            error: null,
          }),
      }),
    }),
    upsert: (row) => {
      upserts.push(row);
      return Promise.resolve({ error: null });
    },
  }));
  return { fromMock, upserts };
}

describe('tag-children-library-badges run()', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
  });

  it('기존 curation_badges 값(parking 등)을 지우지 않고 신규 뱃지를 추가만 한다', async () => {
    const existingBySpot = {
      '7a0eef92-9a6c-44ce-8595-635da8f0a450': ['kids_chair', 'parking'],
    };
    const { fromMock, upserts } = makeAdminClient(existingBySpot);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-28-tag-children-library-badges.mjs');
    const result = await run();

    const targetUpsert = upserts.find((u) => u.spot_id === '7a0eef92-9a6c-44ce-8595-635da8f0a450');
    expect(targetUpsert.curation_badges).toEqual(expect.arrayContaining(['kids_chair', 'parking', 'lib_english_picture_books']));
    expect(targetUpsert.curation_badges).toHaveLength(3);
    expect(result.updatedCount).toBeGreaterThan(0);
  });

  it('spot_curations 행이 아직 없는 스팟은 빈 배열 기준으로 신규 뱃지만 채운다', async () => {
    const { fromMock, upserts } = makeAdminClient({});
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-28-tag-children-library-badges.mjs');
    await run();

    const targetUpsert = upserts.find((u) => u.spot_id === 'a9d785ab-3125-4214-b85c-595916739bcb');
    expect(targetUpsert.curation_badges).toEqual(['floor_seating']);
  });
});
