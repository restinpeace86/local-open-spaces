import { describe, expect, it, vi } from 'vitest';
import { mergeOneGroup } from './2026-09-29-merge-children-library-duplicate-pairs.mjs';

// [미병합 어린이도서관 중복 4쌍 직접 병합] 검증: apply/route.ts와 동일한 로직
// (대표 선정=created_at 오름차순, naver_place_id 조건부 이전, excluded_weekdays
// 일치 시 병합)을 재현하는지 확인한다.

function makeAdminClient({ memberRows, insertedGroupId = 'group-1' }) {
  const updateCalls = [];
  const insertCalls = [];
  const fromMock = vi.fn((table) => {
    if (table === 'open_spaces') {
      return {
        select: () => ({ in: () => Promise.resolve({ data: memberRows, error: null }) }),
        update: (patch) => ({
          in: (_col, ids) => {
            updateCalls.push({ patch, ids });
            return Promise.resolve({ error: null });
          },
          eq: (_col, id) => {
            updateCalls.push({ patch, ids: [id] });
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === 'spot_dedup_groups') {
      return {
        insert: (row) => {
          insertCalls.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: insertedGroupId }, error: null }) }) };
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { admin: { from: fromMock }, updateCalls, insertCalls };
}

describe('mergeOneGroup', () => {
  it('created_at이 더 이른 멤버를 대표로 지정한다', async () => {
    const memberRows = [
      { id: 'a', created_at: '2026-08-25T00:00:00Z', naver_place_id: null, excluded_weekdays: null, excluded_nth_weekdays: null },
      { id: 'b', created_at: '2026-08-19T00:00:00Z', naver_place_id: null, excluded_weekdays: null, excluded_nth_weekdays: null },
    ];
    const { admin, updateCalls } = makeAdminClient({ memberRows });

    const result = await mergeOneGroup(admin, { spotIds: ['a', 'b'], standardName: '테스트도서관' });

    expect(result.representativeId).toBe('b');
    const repUpdate = updateCalls.find((c) => c.patch.is_dedup_representative === true);
    expect(repUpdate.ids).toEqual(['b']);
  });

  it('비대표 멤버 하나만 naver_place_id를 가지고 있으면 대표로 이전한다', async () => {
    const memberRows = [
      { id: 'a', created_at: '2026-08-19T00:00:00Z', naver_place_id: null, excluded_weekdays: null, excluded_nth_weekdays: null },
      { id: 'b', created_at: '2026-08-25T00:00:00Z', naver_place_id: 'naver-123', excluded_weekdays: null, excluded_nth_weekdays: null },
    ];
    const { admin, updateCalls } = makeAdminClient({ memberRows });

    await mergeOneGroup(admin, { spotIds: ['a', 'b'], standardName: '테스트도서관' });

    const clearCall = updateCalls.find((c) => c.patch.naver_place_id === null && c.ids[0] === 'b');
    const migrateCall = updateCalls.find((c) => c.patch.naver_place_id === 'naver-123' && c.ids[0] === 'a');
    expect(clearCall).toBeDefined();
    expect(migrateCall).toBeDefined();
  });

  it('excluded_weekdays 값이 서로 같으면 그룹 갱신에 포함한다', async () => {
    const memberRows = [
      { id: 'a', created_at: '2026-08-19T00:00:00Z', naver_place_id: null, excluded_weekdays: ['MON'], excluded_nth_weekdays: null },
      { id: 'b', created_at: '2026-08-25T00:00:00Z', naver_place_id: null, excluded_weekdays: ['MON'], excluded_nth_weekdays: null },
    ];
    const { admin, updateCalls } = makeAdminClient({ memberRows });

    await mergeOneGroup(admin, { spotIds: ['a', 'b'], standardName: '테스트도서관' });

    const groupUpdate = updateCalls.find((c) => Array.isArray(c.ids) && c.ids.length === 2);
    expect(groupUpdate.patch.excluded_weekdays).toEqual(['MON']);
  });

  it('spot_dedup_groups에 표준명과 노출중분류를 기록한다', async () => {
    const memberRows = [
      { id: 'a', created_at: '2026-08-19T00:00:00Z', naver_place_id: null, excluded_weekdays: null, excluded_nth_weekdays: null },
      { id: 'b', created_at: '2026-08-25T00:00:00Z', naver_place_id: null, excluded_weekdays: null, excluded_nth_weekdays: null },
    ];
    const { admin, insertCalls } = makeAdminClient({ memberRows });

    await mergeOneGroup(admin, { spotIds: ['a', 'b'], standardName: '테스트도서관' });

    expect(insertCalls[0]).toEqual({
      member_spot_ids: ['a', 'b'],
      standard_name: '테스트도서관',
      service_category_id: '22286b2a-b386-4bb6-a853-31b62b3f62c7',
    });
  });
});
