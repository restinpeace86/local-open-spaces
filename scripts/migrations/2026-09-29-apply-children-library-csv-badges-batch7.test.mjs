import { afterEach, describe, expect, it, vi } from 'vitest';

// [사용자 제공 CSV(batch7) 기반 어린이도서관 뱃지 반영] 검증: 기존
// curation_badges 값을 지우지 않고 추가만 하는지, 큐레이션 행이 없는
// 스팟은 빈 배열 기준으로 채워지는지 확인한다.

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

describe('apply-children-library-csv-badges-batch7 run()', () => {
  afterEach(() => {
    vi.doUnmock('../ingest/lib/supabase-admin.mjs');
    vi.resetModules();
  });

  it('기존 curation_badges 값을 지우지 않고 신규 뱃지를 추가만 한다', async () => {
    const { fromMock, upserts } = makeAdminClient({ '38782a96-f1ca-4af3-9bb9-5e136583bada': ['parking'] });
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run, BADGE_ASSIGNMENTS } = await import('./2026-09-29-apply-children-library-csv-badges-batch7.mjs');
    const result = await run();

    const targetUpsert = upserts.find((u) => u.spot_id === '38782a96-f1ca-4af3-9bb9-5e136583bada');
    expect(targetUpsert.curation_badges).toEqual(
      expect.arrayContaining(['parking', 'floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program'])
    );
    expect(result.updatedCount).toBe(Object.keys(BADGE_ASSIGNMENTS).length);
  });

  it('서울특별시교육청어린이도서관의 세 번째 후보(fc529917, 정확한 주소로 재확인됨)에 반영된다', async () => {
    const { fromMock, upserts } = makeAdminClient({});
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-29-apply-children-library-csv-badges-batch7.mjs');
    await run();

    const target = upserts.find((u) => u.spot_id === 'fc529917-5d25-4f1d-a259-63eec1efd41b');
    expect(target).toBeDefined();
    expect(target.curation_badges).toEqual(['floor_seating', 'lib_infant_reading_room', 'lib_quiet_talk_allowed', 'lib_weekend_program']);
  });

  it('spot_curations 행이 아직 없는 스팟은 빈 배열 기준으로 신규 뱃지만 채운다', async () => {
    const { fromMock, upserts } = makeAdminClient({});
    vi.doMock('../ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { run } = await import('./2026-09-29-apply-children-library-csv-badges-batch7.mjs');
    await run();

    const target = upserts.find((u) => u.spot_id === '3265fe53-05cc-4c5e-9565-30b5917b671e');
    expect(target.curation_badges).toEqual(['lib_weekend_program']);
  });
});
