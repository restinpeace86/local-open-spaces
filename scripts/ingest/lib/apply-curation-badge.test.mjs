import { describe, expect, it, vi } from 'vitest';
import { applyCurationBadgeToExternalIds } from './apply-curation-badge.mjs';

function makeAdmin({ spots, curations }) {
  const upsertCalls = [];
  const openSpacesInCalls = [];
  const fromMock = vi.fn((table) => {
    if (table === 'open_spaces') {
      return {
        select: () => ({
          in: (_col, ids) => {
            openSpacesInCalls.push(ids);
            return Promise.resolve({ data: spots, error: null });
          },
        }),
      };
    }
    if (table === 'spot_curations') {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: curations, error: null }),
        }),
        upsert: (rows, opts) => {
          upsertCalls.push({ rows, opts });
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock, upsertCalls, openSpacesInCalls };
}

describe('applyCurationBadgeToExternalIds', () => {
  it('기존 뱃지가 없으면 새 뱃지 배열로 upsert한다', async () => {
    const admin = makeAdmin({
      spots: [{ id: 'spot-1' }, { id: 'spot-2' }],
      curations: [],
    });

    const result = await applyCurationBadgeToExternalIds(admin, ['ext-1', 'ext-2'], 'kc_seoul_type');

    expect(result).toEqual({ taggedCount: 2 });
    expect(admin.upsertCalls[0].rows).toEqual(
      expect.arrayContaining([
        { spot_id: 'spot-1', curation_badges: ['kc_seoul_type'] },
        { spot_id: 'spot-2', curation_badges: ['kc_seoul_type'] },
      ])
    );
    expect(admin.upsertCalls[0].opts).toEqual({ onConflict: 'spot_id' });
  });

  it('기존 뱃지가 있으면 보존하고 새 뱃지를 추가한다(합집합)', async () => {
    const admin = makeAdmin({
      spots: [{ id: 'spot-1' }],
      curations: [{ spot_id: 'spot-1', curation_badges: ['parking'] }],
    });

    await applyCurationBadgeToExternalIds(admin, ['ext-1'], 'kc_seoul_type');

    expect(admin.upsertCalls[0].rows).toEqual([{ spot_id: 'spot-1', curation_badges: ['parking', 'kc_seoul_type'] }]);
  });

  it('이미 같은 뱃지가 있으면 중복 추가하지 않는다', async () => {
    const admin = makeAdmin({
      spots: [{ id: 'spot-1' }],
      curations: [{ spot_id: 'spot-1', curation_badges: ['kc_seoul_type'] }],
    });

    await applyCurationBadgeToExternalIds(admin, ['ext-1'], 'kc_seoul_type');

    expect(admin.upsertCalls[0].rows).toEqual([{ spot_id: 'spot-1', curation_badges: ['kc_seoul_type'] }]);
  });

  it('externalIds가 비어있으면 아무것도 조회하지 않는다', async () => {
    const admin = makeAdmin({ spots: [], curations: [] });
    const result = await applyCurationBadgeToExternalIds(admin, [], 'kc_seoul_type');
    expect(result).toEqual({ taggedCount: 0 });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('매칭되는 스팟이 없으면 조용히 건너뛴다', async () => {
    const admin = makeAdmin({ spots: [], curations: [] });
    const result = await applyCurationBadgeToExternalIds(admin, ['ext-missing'], 'kc_seoul_type');
    expect(result).toEqual({ taggedCount: 0 });
  });

  // [URL 길이 제한 방어](2026-10-01 실측): 오케이존 654건을 500건 단위로 조회하다
  // "Bad Request"가 났다 — supabase-admin.mjs의 SELECT_LOOKUP_BATCH_SIZE(200)와
  // 동일한 값으로 청크 크기를 맞췄는지 검증한다.
  it('externalIds가 200건을 넘으면 200건 단위로 나눠 조회한다', async () => {
    const admin = makeAdmin({ spots: [], curations: [] });
    const manyIds = Array.from({ length: 450 }, (_, i) => `ext-${i}`);

    await applyCurationBadgeToExternalIds(admin, manyIds, 'kc_seoul_type');

    expect(admin.openSpacesInCalls).toHaveLength(3);
    expect(admin.openSpacesInCalls[0]).toHaveLength(200);
    expect(admin.openSpacesInCalls[1]).toHaveLength(200);
    expect(admin.openSpacesInCalls[2]).toHaveLength(50);
  });
});
