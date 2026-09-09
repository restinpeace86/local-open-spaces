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
      { id: 'c', category_min: '기타', raw_data: { instlPlaceCd: 'A999' } }, // 매핑 대상 아닌 코드 -> 그대로
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

  // [개선사항3 - 설치장소코드 표준 중분류 전면 정비](todo.md, 2026-09-09 사용자 지시):
  // "A004 항목은 표준중분류 '놀이방식당'에 데이터가 포함되지 않은 데이터들에 한해서..
  // 식품접객업소로 모아넣기" — 대표가 명시적으로 확인: "놀이방식당으로 중분류 된 것만
  // 건들지 않으면 됨"(다른 값, 예: RULE로 분류된 "어린이놀이터" 등은 보호 대상 아님).
  describe('놀이방식당 보호(2026-09-09)', () => {
    it('category_min이 놀이방식당인 행은 설치장소코드가 매핑 대상이어도 절대 덮어쓰지 않는다', async () => {
      const rows = [
        { id: 'fixed', category_min: '놀이방식당', raw_data: { instlPlaceCd: 'A004' } },
        { id: 'scattered', category_min: '기타', raw_data: { instlPlaceCd: 'A004' } },
      ];
      const client = makeFakeClient(rows);

      const result = await applyPlaygroundInstallPlaceCategoryMapping(client);

      expect(result.updated).toBe(1);
      expect(client.updates.some((u) => u.ids.includes('fixed'))).toBe(false);
      const updateForScattered = client.updates.find((u) => u.ids.includes('scattered'));
      expect(updateForScattered.payload).toEqual({ category_min: '식품접객업소', category_min_source: 'RAW' });
    });

    it('실측으로 발견된 다른 RULE 자동분류 값(예: 어린이놀이터)은 보호 대상이 아니라 그대로 덮어쓴다', async () => {
      // A010(주택단지)의 39,230건이 이미 "어린이놀이터"로 RULE 자동분류돼 있었지만,
      // 대표 확인: "현재 의미 가지지 않음.. 놀이방식당으로 중분류 된 것만 건들지
      // 않으면 됨" — 이 값은 보호되지 않는다.
      const rows = [{ id: 'a', category_min: '어린이놀이터', raw_data: { instlPlaceCd: 'A010' } }];
      const client = makeFakeClient(rows);

      const result = await applyPlaygroundInstallPlaceCategoryMapping(client);

      expect(result.updated).toBe(1);
      const update = client.updates.find((u) => u.ids.includes('a'));
      expect(update.payload).toEqual({ category_min: '주택단지', category_min_source: 'RAW' });
    });
  });

  it('22개 설치장소코드 매핑 테이블 값이 정확하다', () => {
    expect(INSTALL_PLACE_CODE_TO_CATEGORY_MIN).toEqual({
      A001: '목욕장업소',
      A002: '도로휴게시설',
      A003: '공원',
      A004: '식품접객업소',
      A005: '아동복지시설',
      A006: '어린이집',
      A007: '유치원',
      A008: '대규모점포',
      A009: '의료기관',
      A010: '주택단지',
      A011: '학교',
      A012: '학원',
      A013: '키즈카페',
      A020: '주상복합',
      A022: '종합/기타박물관',
      A023: '종교시설',
      A030: '자연휴양림',
      A031: '하천',
      A032: '캠핑장',
      A033: '도서관',
      A092: '육아종합지원센터',
      A093: '유아교육진흥원',
    });
  });
});
