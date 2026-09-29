import { describe, expect, it, vi } from 'vitest';
import { mergeOneGroup } from './2026-09-29-merge-children-library-duplicate-pairs.mjs';
import { consolidateBadgesToRepresentative } from './2026-09-29-merge-and-consolidate-badges-library-duplicates.mjs';

// [서울특별시교육청어린이도서관 + 글마루한옥어린이도서관 병합 & 뱃지 통합] 검증.
// mergeOneGroup 자체(대표 선정/naver_place_id/excluded_weekdays)는 다른
// 테스트 파일에서 이미 검증됐으므로, 이 파일이 그 함수를 재사용하는지와
// consolidateBadgesToRepresentative(뱃지 합집합 반영) 로직만 검증한다.

function makeAdminClient(curationRowsBySpot, existingRepresentativeBadges) {
  const upserts = [];
  const fromMock = vi.fn(() => ({
    select: () => ({
      in: (_col, spotIds) =>
        Promise.resolve({
          data: spotIds.flatMap((id) => (curationRowsBySpot[id] ? [{ spot_id: id, curation_badges: curationRowsBySpot[id] }] : [])),
          error: null,
        }),
      eq: (_col) => ({
        maybeSingle: () =>
          Promise.resolve({
            data: existingRepresentativeBadges !== undefined ? { curation_badges: existingRepresentativeBadges } : null,
            error: null,
          }),
      }),
    }),
    upsert: (row) => {
      upserts.push(row);
      return Promise.resolve({ error: null });
    },
  }));
  return { admin: { from: fromMock }, upserts };
}

describe('mergeOneGroup은 기존 파일의 함수를 그대로 재사용한다', () => {
  it('import가 성공하고 함수로 존재한다', () => {
    expect(typeof mergeOneGroup).toBe('function');
  });
});

describe('consolidateBadgesToRepresentative', () => {
  it('그룹 멤버 전원의 curation_badges 합집합을 대표 행에 반영한다', async () => {
    const { admin, upserts } = makeAdminClient({ a: ['floor_seating', 'lib_weekend_program'], b: ['parking'], c: [] }, ['floor_seating', 'lib_weekend_program']);

    const merged = await consolidateBadgesToRepresentative(admin, ['a', 'b', 'c'], 'a');

    expect(merged.sort()).toEqual(['floor_seating', 'lib_weekend_program', 'parking']);
    expect(upserts).toEqual([{ spot_id: 'a', curation_badges: expect.arrayContaining(['floor_seating', 'lib_weekend_program', 'parking']) }]);
  });

  it('큐레이션 행이 하나도 없는 멤버(빈 배열)는 합집합에 아무것도 추가하지 않는다', async () => {
    const { admin } = makeAdminClient({}, undefined);

    const merged = await consolidateBadgesToRepresentative(admin, ['a', 'b'], 'a');

    expect(merged).toEqual([]);
  });

  it('중복된 뱃지는 한 번만 남는다', async () => {
    const { admin } = makeAdminClient({ a: ['floor_seating'], b: ['floor_seating', 'lib_weekend_program'] }, ['floor_seating']);

    const merged = await consolidateBadgesToRepresentative(admin, ['a', 'b'], 'a');

    expect(merged.sort()).toEqual(['floor_seating', 'lib_weekend_program']);
  });
});
