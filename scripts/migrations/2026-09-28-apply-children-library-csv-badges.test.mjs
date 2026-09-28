import { afterEach, describe, expect, it, vi } from 'vitest';

// [사용자 제공 CSV 기반 어린이도서관 뱃지 일괄 반영] 검증: 기존 curation_badges
// 값을 지우지 않고 신규 뱃지를 추가만 하는지, 행이 아직 없는 스팟은 빈 배열
// 기준으로 채워지는지 확인한다(2026-09-28-tag-children-library-badges.test.mjs와
// 동일한 패턴).

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

describe('apply-children-library-csv-badges run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('기존 curation_badges 값(예: parking)을 지우지 않고 CSV 뱃지를 추가만 한다', async () => {
    const existingBySpot = {
      '856a9b20-bafa-41ab-a2a4-b82e4fe18818': ['reservation_possible', 'parking'],
    };
    const { fromMock, upserts } = makeAdminClient(existingBySpot);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, BADGE_ASSIGNMENTS } = await import('./2026-09-28-apply-children-library-csv-badges.mjs');
    const result = await run();

    const targetUpsert = upserts.find((u) => u.spot_id === '856a9b20-bafa-41ab-a2a4-b82e4fe18818');
    expect(targetUpsert.curation_badges).toEqual(
      expect.arrayContaining(['reservation_possible', 'parking', 'lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books'])
    );
    expect(result.updatedCount).toBe(Object.keys(BADGE_ASSIGNMENTS).length);
  });

  it('spot_curations 행이 아직 없는 스팟은 빈 배열 기준으로 CSV 뱃지만 채운다', async () => {
    const { fromMock, upserts } = makeAdminClient({});
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-28-apply-children-library-csv-badges.mjs');
    await run();

    const targetUpsert = upserts.find((u) => u.spot_id === 'c33fcde7-a6de-4d76-9581-9051b84cc177');
    expect(targetUpsert.curation_badges).toEqual(['lib_comics_webtoon', 'lib_weekend_program']);
  });

  it('중복 대표 행 쌍(국립어린이청소년도서관 5fbaa562/37419c19)에 동일한 뱃지가 둘 다 반영된다', async () => {
    const { fromMock, upserts } = makeAdminClient({});
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-28-apply-children-library-csv-badges.mjs');
    await run();

    const a = upserts.find((u) => u.spot_id === '5fbaa562-4b70-4d73-ae54-dd0d0c48308f');
    const b = upserts.find((u) => u.spot_id === '37419c19-a1a2-4d37-9630-1d61e1bd936f');
    expect(a.curation_badges).toEqual(b.curation_badges);
  });
});
