import { describe, expect, it } from 'vitest';
import {
  applyCategoryMajTaxonomy,
  CATEGORY_MAJ_OF,
  matchCategoryMinByKeyword,
  resolveCategoryForRow,
} from './category-maj-taxonomy.mjs';

describe('resolveCategoryForRow', () => {
  it('MANUAL 행은 절대 건드리지 않는다(null 반환 = 보존)', () => {
    const row = { title: '아무 제목', category_min: '전시실', category_min_source: 'MANUAL' };
    expect(resolveCategoryForRow(row)).toBeNull();
  });

  it('RAW 행은 제목이 아니라 raw_data.MINCLASSNM(원본, 불변)을 구→신 매핑 테이블로 치환한다(개명: 서울형키즈카페→공공키즈카페)', () => {
    const row = {
      title: '전혀 관련 없는 제목',
      category_min: '서울형키즈카페',
      category_min_source: 'RAW',
      raw_data: { MINCLASSNM: '서울형키즈카페' },
    };
    expect(resolveCategoryForRow(row)).toEqual({
      category_min: '공공키즈카페',
      category_maj: '공공 키즈카페',
      category_min_source: 'RAW',
    });
  });

  it('RAW 행이 신규 목록에 없는 값(예: 청년정보)이면 NULL로 정리한다', () => {
    const row = {
      title: '청년센터 프로그램',
      category_min: '청년정보',
      category_min_source: 'RAW',
      raw_data: { MINCLASSNM: '청년정보' },
    };
    expect(resolveCategoryForRow(row)).toEqual({
      category_min: null,
      category_maj: null,
      category_min_source: null,
    });
  });

  it('RAW 행이 그대로 유지되는 이름이면 이름은 안 바뀌고 category_maj만 채워진다', () => {
    const row = { title: '아무 제목', category_min: '역사', category_min_source: 'RAW', raw_data: { MINCLASSNM: '역사' } };
    expect(resolveCategoryForRow(row)).toEqual({
      category_min: '역사',
      category_maj: '문화 / 전시',
      category_min_source: 'RAW',
    });
  });

  it('실측 발견 버그 재발 방지(멱등성): category_min 컬럼이 이미 신규 이름으로 바뀐 뒤 다시 실행해도(raw_data는 불변) 같은 결과가 나온다', () => {
    // 첫 실행 이후 DB의 category_min은 이미 "공공키즈카페"(신규 이름)로 바뀌어 있지만,
    // raw_data.MINCLASSNM은 원본("서울형키즈카페") 그대로다 — 재실행 시에도 원본을 기준으로
    // 판단해야 한다(category_min 컬럼 값을 기준으로 삼으면 매핑 테이블에 키가 없어 NULL로
    // 잘못 지워짐 — 실제로 132건이 이렇게 소실됐던 버그).
    const rowAfterFirstRun = {
      title: '전혀 관련 없는 제목',
      category_min: '공공키즈카페', // 이미 신규 이름으로 바뀐 상태
      category_min_source: 'RAW',
      raw_data: { MINCLASSNM: '서울형키즈카페' }, // 원본은 불변
    };
    expect(resolveCategoryForRow(rowAfterFirstRun)).toEqual({
      category_min: '공공키즈카페',
      category_maj: '공공 키즈카페',
      category_min_source: 'RAW',
    });
  });

  it('RULE/NULL 행은 새 규칙으로 제목을 다시 스캔한다', () => {
    const ruleRow = { title: '가을 축제 한마당', category_min: '문화행사', category_min_source: 'RULE' };
    expect(resolveCategoryForRow(ruleRow)).toEqual({
      category_min: '지역축제/페스티벌',
      category_maj: '축제 / 이벤트',
      category_min_source: 'RULE',
    });

    const nullRow = { title: '올림픽수영장 강습', category_min: null, category_min_source: null };
    expect(resolveCategoryForRow(nullRow)).toEqual({
      category_min: '수영장',
      category_maj: '스포츠 대여',
      category_min_source: 'RULE',
    });
  });

  it('아무 키워드에도 안 걸리면 NULL로 정리한다', () => {
    const row = { title: '완전히 고유명사뿐인 제목', category_min: null, category_min_source: null };
    expect(resolveCategoryForRow(row)).toEqual({ category_min: null, category_maj: null, category_min_source: null });
  });

  it('[2026-08-27 본문 반영] title만으로는 매칭 안 되지만 description에 키워드가 있으면 매칭된다', () => {
    const row = {
      title: '2026 봄맞이 프로그램 안내',
      description: '가족과 함께하는 도시농업 텃밭 가꾸기 체험',
      category_min: null,
      category_min_source: null,
    };
    expect(resolveCategoryForRow(row)).toEqual({
      category_min: '도시농업',
      category_maj: '체험 / 농장',
      category_min_source: 'RULE',
    });
  });
});

describe('matchCategoryMinByKeyword', () => {
  it('전시관은 전시/관람이 아니라 전시실로 먼저 매칭된다(구체적인 것 우선)', () => {
    expect(matchCategoryMinByKeyword('OO미술 전시관 특별전')).toBe('전시실');
  });

  it('공연장은 문화행사가 아니라 공연장으로 먼저 매칭된다', () => {
    expect(matchCategoryMinByKeyword('OO공연장 대관 안내')).toBe('공연장');
  });

  it('실측 발견 버그 재발 방지: "OO문화재단"(기관명)은 역사로 오매칭되지 않는다', () => {
    expect(matchCategoryMinByKeyword('[마포문화재단] 2026 인디스커버리 페스타')).not.toBe('역사');
    expect(matchCategoryMinByKeyword('서울문화재단 예술창작활동지원 선정 프로젝트')).toBeNull();
  });

  it('"문화재단"이 아닌 진짜 문화재 관련 제목은 여전히 역사로 매칭된다', () => {
    expect(matchCategoryMinByKeyword('국가지정문화재 답사 프로그램')).toBe('역사');
  });
});

describe('CATEGORY_MAJ_OF', () => {
  it('36개 중분류 모두 7대 대분류 중 하나에 속한다', () => {
    const majValues = new Set(Object.values(CATEGORY_MAJ_OF));
    expect(majValues.size).toBe(7);
  });
});

function makeFakeClient(rows) {
  return {
    from(table) {
      return {
        select() {
          const state = {};
          const builder = {
            eq(column, value) {
              state[column] = value;
              return builder;
            },
            gt(column, value) {
              state.gtId = value;
              return builder;
            },
            order() {
              return builder;
            },
            limit(n) {
              let filtered = rows;
              if ('is_active' in state) filtered = filtered.filter((r) => r.is_active === state.is_active);
              if (state.gtId) filtered = filtered.filter((r) => r.id > state.gtId);
              filtered = filtered.slice(0, n);
              return Promise.resolve({
                data: filtered.map((r) => ({
                  id: r.id,
                  title: r.title,
                  description: r.description ?? null,
                  category_min: r.category_min,
                  category_min_source: r.category_min_source,
                  raw_data: r.raw_data ?? null,
                })),
                error: null,
              });
            },
          };
          return builder;
        },
        update(patch) {
          const state = {};
          const builder = {
            eq(column, value) {
              state[column] = value;
              const row = rows.find((r) => r.id === state.id);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

describe('applyCategoryMajTaxonomy', () => {
  it('is_active=true 행만 스캔하고, MANUAL은 보존, RAW는 매핑, RULE/NULL은 재매칭한다', async () => {
    const rows = [
      { id: 'a', title: '무관', category_min: '전시실', category_min_source: 'MANUAL', is_active: true },
      {
        id: 'b',
        title: '무관',
        category_min: '서울형키즈카페',
        category_min_source: 'RAW',
        is_active: true,
        raw_data: { MINCLASSNM: '서울형키즈카페' },
      },
      { id: 'c', title: '올림픽수영장 강습', category_min: null, category_min_source: null, is_active: true },
      { id: 'd', title: '비활성 행 제목', category_min: null, category_min_source: null, is_active: false },
    ];
    const client = makeFakeClient(rows);

    const result = await applyCategoryMajTaxonomy(client);

    expect(result.scanned).toBe(3); // is_active=false인 'd'는 스캔 대상 아님
    expect(result.preservedManual).toBe(1);
    expect(result.updatedToValue).toBe(2);

    expect(rows.find((r) => r.id === 'a').category_min).toBe('전시실'); // MANUAL 보존
    expect(rows.find((r) => r.id === 'b')).toMatchObject({ category_min: '공공키즈카페', category_maj: '공공 키즈카페' });
    expect(rows.find((r) => r.id === 'c')).toMatchObject({ category_min: '수영장', category_maj: '스포츠 대여' });
    expect(rows.find((r) => r.id === 'd').category_min).toBeNull(); // 비활성이라 손대지 않음
  });

  it('실측 발견 버그 재발 방지(멱등성): 같은 데이터로 두 번 실행해도 RAW 행 결과가 그대로 유지된다', async () => {
    const rows = [
      {
        id: 'b',
        title: '무관',
        category_min: '서울형키즈카페',
        category_min_source: 'RAW',
        is_active: true,
        raw_data: { MINCLASSNM: '서울형키즈카페' },
      },
    ];
    const client = makeFakeClient(rows);

    await applyCategoryMajTaxonomy(client);
    expect(rows[0]).toMatchObject({ category_min: '공공키즈카페', category_maj: '공공 키즈카페' });

    // 두 번째 실행 시점에는 category_min이 이미 "공공키즈카페"(신규 이름)로 바뀐 상태다 —
    // raw_data.MINCLASSNM(불변)을 기준으로 판단하므로 결과가 흔들리지 않아야 한다.
    await applyCategoryMajTaxonomy(client);
    expect(rows[0]).toMatchObject({ category_min: '공공키즈카페', category_maj: '공공 키즈카페', category_min_source: 'RAW' });
  });
});
