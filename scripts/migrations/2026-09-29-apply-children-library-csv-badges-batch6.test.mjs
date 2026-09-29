import { afterEach, describe, expect, it, vi } from 'vitest';

// [사용자 제공 CSV(batch6) 기반 어린이도서관 뱃지 일괄 반영] 검증: 기존
// curation_badges 값을 지우지 않고 추가만 하는지, 큐레이션 행이 없는 스팟은
// 빈 배열 기준으로 채워지는지 확인한다(batch1 테스트와 동일 패턴).

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

describe('apply-children-library-csv-badges-batch6 run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('기존 curation_badges 값을 지우지 않고 신규 뱃지를 추가만 한다', async () => {
    const existingBySpot = {
      'ad64b6ec-d3b2-4e17-a9f0-f902a8e38b05': ['parking'],
    };
    const { fromMock, upserts } = makeAdminClient(existingBySpot);
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, BADGE_ASSIGNMENTS } = await import('./2026-09-29-apply-children-library-csv-badges-batch6.mjs');
    const result = await run();

    const targetUpsert = upserts.find((u) => u.spot_id === 'ad64b6ec-d3b2-4e17-a9f0-f902a8e38b05');
    expect(targetUpsert.curation_badges).toEqual(
      expect.arrayContaining(['parking', 'lib_infant_reading_room', 'lib_weekend_program', 'lib_english_picture_books', 'lib_parking_convenient'])
    );
    expect(result.updatedCount).toBe(Object.keys(BADGE_ASSIGNMENTS).length);
  });

  it('서울특별시교육청어린이도서관 후보 3개 중 주소가 일치하는 쌍(f5759c7f/4ecb04fc)에만 동일하게 반영된다', async () => {
    const { fromMock, upserts } = makeAdminClient({});
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-29-apply-children-library-csv-badges-batch6.mjs');
    await run();

    const a = upserts.find((u) => u.spot_id === 'f5759c7f-31d2-4e63-81f6-bf2aa86edca7');
    const b = upserts.find((u) => u.spot_id === '4ecb04fc-dacb-4f90-9e73-0a1de4fe0a69');
    const c = upserts.find((u) => u.spot_id === 'fc529917-5d25-4f1d-a259-63eec1efd41b');
    expect(a.curation_badges).toEqual(b.curation_badges);
    expect(c).toBeUndefined();
  });

  it('spot_curations 행이 아직 없는 스팟은 빈 배열 기준으로 신규 뱃지만 채운다', async () => {
    const { fromMock, upserts } = makeAdminClient({});
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-29-apply-children-library-csv-badges-batch6.mjs');
    await run();

    const targetUpsert = upserts.find((u) => u.spot_id === '7f3786df-8149-431e-af80-2b33b86a8ed6');
    expect(targetUpsert.curation_badges).toEqual(['lib_comics_webtoon', 'lib_weekend_program']);
  });
});
