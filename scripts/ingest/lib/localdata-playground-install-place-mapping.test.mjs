// [행안부 놀이시설 설치장소코드 매핑 백필](2026-08-29) 단위 테스트
import { describe, expect, it, vi } from 'vitest';
import { applyPlaygroundInstallPlaceCategoryMapping, INSTALL_PLACE_CODE_TO_CATEGORY_MIN } from './localdata-playground-install-place-mapping.mjs';

function makeFakeClient(rows) {
  const updates = [];
  return {
    updates,
    from(table) {
      expect(table).toBe('open_spaces');
      return {
        select: () => ({
          eq: (col, val) => {
            expect(col).toBe('source_type');
            expect(val).toBe('LOCALDATA_PLAYGROUND');
            return {
              order: () => ({
                limit: () => Promise.resolve({ data: rows, error: null }),
                gt: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
              }),
            };
          },
        }),
        update: (payload) => ({
          in: (col, ids) => {
            expect(col).toBe('id');
            updates.push({ payload, ids });
            return Promise.resolve({ error: null, count: ids.length });
          },
        }),
      };
    },
  };
}

describe('applyPlaygroundInstallPlaceCategoryMapping', () => {
  it('설치장소코드가 매핑 대상이면 기존 category_min 값과 무관하게 덮어쓴다', async () => {
    const rows = [
      { id: 'a', category_min: '어린이놀이터', raw_data: { instlPlaceCd: 'A092' } }, // 이미 RULE로 분류돼 있어도 덮어써야 함
      { id: 'b', category_min: null, raw_data: { instlPlaceCd: 'A093' } },
      { id: 'c', category_min: '기타', raw_data: { instlPlaceCd: 'A011' } }, // 매핑 대상 아님 -> 그대로
    ];
    const client = makeFakeClient(rows);

    const result = await applyPlaygroundInstallPlaceCategoryMapping(client);

    expect(result.scanned).toBe(3);
    expect(result.updated).toBe(2);
    expect(result.breakdown).toEqual({ 육아종합지원센터: 1, 유아교육진흥원: 1 });

    const updateForA = client.updates.find((u) => u.ids.includes('a'));
    expect(updateForA.payload).toEqual({ category_min: '육아종합지원센터', category_min_source: 'RAW' });
    const updateForB = client.updates.find((u) => u.ids.includes('b'));
    expect(updateForB.payload).toEqual({ category_min: '유아교육진흥원', category_min_source: 'RAW' });
    expect(client.updates.some((u) => u.ids.includes('c'))).toBe(false);
  });

  it('이미 목표 category_min과 동일한 값이면 UPDATE 대상에서 제외한다(불필요한 쓰기 방지)', async () => {
    const rows = [{ id: 'x', category_min: '공원', raw_data: { instlPlaceCd: 'A003' } }];
    const client = makeFakeClient(rows);

    const result = await applyPlaygroundInstallPlaceCategoryMapping(client);

    expect(result.updated).toBe(0);
    expect(client.updates).toHaveLength(0);
  });

  it('8개 매핑 테이블 값이 정확하다', () => {
    expect(INSTALL_PLACE_CODE_TO_CATEGORY_MIN).toEqual({
      A003: '공원',
      A013: '키즈카페',
      A022: '종합/기타박물관',
      A030: '자연휴양림',
      A032: '캠핑장',
      A033: '도서관',
      A092: '육아종합지원센터',
      A093: '유아교육진흥원',
    });
  });
});
