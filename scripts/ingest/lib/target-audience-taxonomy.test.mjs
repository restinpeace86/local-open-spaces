import { describe, expect, it } from 'vitest';
import {
  applyOtherReviewFlag,
  applyTargetAudienceTaxonomy,
  matchTag,
  resolveOtherReviewTag,
  resolveTargetAudienceForRow,
  resolveViaCategory,
  resolveViaRawField,
  resolveViaText,
} from './target-audience-taxonomy.mjs';

describe('matchTag', () => {
  it('우선순위 표 순서대로 첫 매칭을 채택한다(초등학생은 KIDS_SCHOOL, TEEN 학생 문맥으로 새지 않음)', () => {
    expect(matchTag('초등학생 대상 체험')).toBe('KIDS_SCHOOL');
  });

  it('허용된 "학생" 문맥은 TEEN으로 매칭된다', () => {
    expect(matchTag('중학생 진로 캠프')).toBe('TEEN');
    expect(matchTag('방과후 학생 동아리 발표회')).toBe('TEEN');
  });

  it('"대학생"/"수강생"은 TEEN 문맥 매칭에서 제외된다', () => {
    expect(matchTag('대학생 인턴십 설명회')).toBeNull();
    expect(matchTag('요가 수강생 모집')).toBeNull();
  });

  it('allowKidFamily=false면 INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY는 건너뛴다', () => {
    expect(matchTag('가족 세미나', { allowKidFamily: false })).toBeNull();
    expect(matchTag('청소년 가족 캠프', { allowKidFamily: false })).toBe('TEEN');
  });

  it('ADULT("성인")와 SENIOR/YOUTH/ALL도 매칭된다', () => {
    expect(matchTag('성인 대상 클래스')).toBe('ADULT');
    expect(matchTag('어르신 건강 체조')).toBe('SENIOR');
    expect(matchTag('청년 창업 캠프')).toBe('YOUTH');
    expect(matchTag('전연령 누구나 참여 가능')).toBe('ALL');
  });
});

describe('resolveViaRawField (0순위)', () => {
  it('단일 토큰이 명확히 매핑되면 성공한다', () => {
    expect(resolveViaRawField({ USETGTINFO: '유아' })).toEqual({ tag: 'KIDS_PRE', viaField: 'USETGTINFO' });
  });

  it('쉼표로 나열된 토큰 전부가 같은 태그로 합의되면 성공한다', () => {
    expect(resolveViaRawField({ USE_TRGT: '어린이, 아동' })).toEqual({ tag: 'KIDS_SCHOOL', viaField: 'USE_TRGT' });
  });

  it('괄호 부연설명은 제거하고 판단한다', () => {
    expect(resolveViaRawField({ USETGTINFO: '유아(만3~5세)' })).toEqual({ tag: 'KIDS_PRE', viaField: 'USETGTINFO' });
  });

  it('순수 연령 외 태그(예: FAMILY)와 섞이면(CONFLICTING_TOKENS) null(다음 단계로 이관)을 반환한다', () => {
    expect(resolveViaRawField({ USETGTINFO: '어린이, 가족' })).toBeNull();
  });

  it('원천 필드가 없으면 null을 반환한다', () => {
    expect(resolveViaRawField(null)).toBeNull();
    expect(resolveViaRawField({})).toBeNull();
  });

  it('[혼재 데이터 정제] 순수 연령 태그끼리 섞이면 가장 젊은 연령대를 대표값으로 채택한다', () => {
    expect(resolveViaRawField({ USETGTINFO: '어린이, 성인' })).toEqual({ tag: 'KIDS_SCHOOL', viaField: 'USETGTINFO' });
    expect(resolveViaRawField({ USETGTINFO: '성인, 청소년, 어린이' })).toEqual({ tag: 'KIDS_SCHOOL', viaField: 'USETGTINFO' });
    expect(resolveViaRawField({ USETGTINFO: '청소년, 성인' })).toEqual({ tag: 'TEEN', viaField: 'USETGTINFO' });
  });

  it('[예외/블랙리스트] 난임/임산부 등 키워드가 있으면 가족/어린이 대상에서 원천 제외한다', () => {
    expect(resolveViaRawField({ USETGTINFO: '가족(난임)' })).toBeNull();
    expect(resolveViaRawField({ USETGTINFO: '여성(난임부부)' })).toBeNull();
    // "성인(난임)"은 kidFamily 태그에서만 배제될 뿐, ADULT로는 정상 매칭된다(완전 제외가 아님).
    expect(resolveViaRawField({ USETGTINFO: '성인(난임)' })).toEqual({ tag: 'ADULT', viaField: 'USETGTINFO' });
  });
});

describe('resolveViaCategory (1단계 FACILITY/KIDS_PRE/YOUTH 판정)', () => {
  it('스포츠 시설 대여류는 FACILITY로 판정한다', () => {
    expect(resolveViaCategory('테니스장', null)).toEqual({ tag: 'FACILITY', via: '테니스장' });
  });

  it('캠핑장/영화촬영/주민공유공간 계열도 FACILITY로 판정한다', () => {
    expect(resolveViaCategory('캠핑장', null)).toEqual({ tag: 'FACILITY', via: '캠핑장' });
    expect(resolveViaCategory('주민공유공간', null)).toEqual({ tag: 'FACILITY', via: '주민공유공간' });
  });

  it('공공키즈카페(신규 이름)와 서울형키즈카페(구 이름) 모두 KIDS_PRE로 판정한다', () => {
    expect(resolveViaCategory('공공키즈카페', null)).toEqual({ tag: 'KIDS_PRE', via: '공공키즈카페' });
    expect(resolveViaCategory(null, '서울형키즈카페')).toEqual({ tag: 'KIDS_PRE', via: '서울형키즈카페' });
  });

  it('청년공간은 YOUTH로 판정한다', () => {
    expect(resolveViaCategory('청년공간', null)).toEqual({ tag: 'YOUTH', via: '청년공간' });
  });

  it('해당 없는 카테고리는 null을 반환한다', () => {
    expect(resolveViaCategory('전시실', null)).toBeNull();
  });
});

describe('resolveViaText (2단계)', () => {
  it('title+description을 함께 스캔한다', () => {
    expect(resolveViaText('2026 프로그램', '가족과 함께하는 체험')).toEqual({ tag: 'FAMILY' });
  });

  it('부모/학부모 등 소거 키워드가 있으면 KIDS/FAMILY로 매칭하지 않는다', () => {
    expect(resolveViaText('학부모 교육 특강', null)).toBeNull();
  });

  it('"시민"/"주민"은 소거 대상에서 제외되어 다른 키워드와 함께 있으면 정상 매칭된다', () => {
    expect(resolveViaText('시민과 함께하는 가족 축제', null)).toEqual({ tag: 'FAMILY' });
  });
});

describe('resolveTargetAudienceForRow (통합 우선순위: 0순위 > 1단계 > 2단계)', () => {
  it('MANUAL 행은 절대 건드리지 않는다(null 반환 = 보존)', () => {
    const row = { title: '아무 제목', target_audience_source: 'MANUAL' };
    expect(resolveTargetAudienceForRow(row)).toBeNull();
  });

  it('0순위 원천 필드가 있으면 최우선으로 채택한다', () => {
    const row = {
      title: '테니스장 대관',
      category_min: '테니스장',
      raw_data: { USETGTINFO: '유아' },
    };
    expect(resolveTargetAudienceForRow(row)).toEqual({ target_audience: 'KIDS_PRE', target_audience_source: 'RAW_FIELD' });
  });

  it('0순위가 없으면 1단계 카테고리 판정을 쓴다', () => {
    const row = { title: '무관한 제목', category_min: '테니스장', raw_data: null };
    expect(resolveTargetAudienceForRow(row)).toEqual({ target_audience: 'FACILITY', target_audience_source: 'CATEGORY' });
  });

  it('0/1단계가 모두 없으면 2단계 텍스트 파싱을 쓴다', () => {
    const row = { title: '가족과 함께하는 도시농업', category_min: '도시농업', raw_data: null };
    expect(resolveTargetAudienceForRow(row)).toEqual({ target_audience: 'FAMILY', target_audience_source: 'TEXT' });
  });

  it('아무 단계에도 매칭되지 않으면 NULL로 정리한다', () => {
    const row = { title: '완전히 고유명사뿐인 제목', category_min: null, raw_data: null };
    expect(resolveTargetAudienceForRow(row)).toEqual({ target_audience: null, target_audience_source: null });
  });
});

function makeFakeClient(rows) {
  return {
    from() {
      return {
        select() {
          const state = {};
          const builder = {
            eq(column, value) {
              state[column] = value;
              return builder;
            },
            gt() {
              return builder;
            },
            order() {
              return builder;
            },
            limit(n) {
              let filtered = rows;
              if ('is_active' in state) filtered = filtered.filter((r) => r.is_active === state.is_active);
              filtered = filtered.slice(0, n);
              return Promise.resolve({
                data: filtered.map((r) => ({
                  id: r.id,
                  title: r.title,
                  description: r.description ?? null,
                  category_min: r.category_min ?? null,
                  target_audience_source: r.target_audience_source ?? null,
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

describe('applyTargetAudienceTaxonomy', () => {
  it('is_active=true 행만 스캔하고, MANUAL은 보존, 나머지는 3단계 퍼널로 판정한다', async () => {
    const rows = [
      { id: 'a', title: '무관', target_audience: '기존값', target_audience_source: 'MANUAL', is_active: true },
      { id: 'b', title: '무관', category_min: '테니스장', is_active: true, raw_data: null },
      { id: 'c', title: '완전히 고유명사뿐인 제목', category_min: null, is_active: true },
      { id: 'd', title: '비활성 행', is_active: false },
    ];
    const client = makeFakeClient(rows);

    const result = await applyTargetAudienceTaxonomy(client);

    expect(result.scanned).toBe(3);
    expect(result.preservedManual).toBe(1);
    expect(result.updatedToValue).toBe(1);
    expect(result.clearedToNull).toBe(1);

    expect(rows.find((r) => r.id === 'a').target_audience).toBe('기존값');
    expect(rows.find((r) => r.id === 'b')).toMatchObject({ target_audience: 'FACILITY', target_audience_source: 'CATEGORY' });
    expect(rows.find((r) => r.id === 'c')).toMatchObject({ target_audience: null, target_audience_source: null });
    expect(rows.find((r) => r.id === 'd').target_audience).toBeUndefined();
  });

  it('멱등성: 같은 데이터로 두 번 실행해도 같은 결과가 나온다', async () => {
    const rows = [{ id: 'b', title: '무관', category_min: '테니스장', is_active: true, raw_data: null }];
    const client = makeFakeClient(rows);

    await applyTargetAudienceTaxonomy(client);
    expect(rows[0]).toMatchObject({ target_audience: 'FACILITY', target_audience_source: 'CATEGORY' });

    await applyTargetAudienceTaxonomy(client);
    expect(rows[0]).toMatchObject({ target_audience: 'FACILITY', target_audience_source: 'CATEGORY' });
  });
});

describe('resolveOtherReviewTag ("타겟 연령 기타" 수동 검수 분리)', () => {
  it('target_audience가 NULL이고 raw_data 기타 필드(DTLCONT)에 키워드가 있으면 OTHER로 분리한다', () => {
    const row = {
      title: '중구 토요일 은하수 길 따라 남산 야간 트레킹',
      description: null,
      target_audience: null,
      target_audience_source: null,
      raw_data: { DTLCONT: '보호자 동반 시 참여 가능합니다', USETGTINFO: null },
    };
    expect(resolveOtherReviewTag(row)).toEqual({ target_audience: 'OTHER', target_audience_source: 'OTHER' });
  });

  it('target_audience가 ALL이고 키워드가 있으면 OTHER로 분리한다', () => {
    const row = {
      title: '아무 제목',
      description: null,
      target_audience: 'ALL',
      target_audience_source: 'RAW_FIELD',
      raw_data: { DTLCONT: '유아 동반 가족 프로그램' },
    };
    expect(resolveOtherReviewTag(row)).toEqual({ target_audience: 'OTHER', target_audience_source: 'OTHER' });
  });

  it('키워드가 전혀 없으면 그대로 둔다(null 반환)', () => {
    const row = {
      title: '성인 대상 요가 클래스',
      description: null,
      target_audience: 'ALL',
      target_audience_source: 'RAW_FIELD',
      raw_data: { DTLCONT: '누구나 참여 가능한 성인 프로그램입니다' },
    };
    expect(resolveOtherReviewTag(row)).toBeNull();
  });

  it('이미 실제 태그(NULL/ALL이 아님)가 확정된 행은 건드리지 않는다', () => {
    const row = {
      title: '무관',
      description: null,
      target_audience: 'KIDS_PRE',
      target_audience_source: 'RAW_FIELD',
      raw_data: { DTLCONT: '보호자 동반 필수' },
    };
    expect(resolveOtherReviewTag(row)).toBeNull();
  });

  it('MANUAL 행은 절대 건드리지 않는다', () => {
    const row = {
      title: '무관',
      description: null,
      target_audience: 'ALL',
      target_audience_source: 'MANUAL',
      raw_data: { DTLCONT: '보호자 동반 필수' },
    };
    expect(resolveOtherReviewTag(row)).toBeNull();
  });

  it('0순위/description으로 이미 스캔된 필드(USETGTINFO 등)의 키워드는 새 신호로 치지 않는다', () => {
    const row = {
      title: '아무 제목',
      description: null,
      target_audience: null,
      target_audience_source: null,
      raw_data: { USETGTINFO: '어린이', PROGRAM: '가족 프로그램' },
    };
    expect(resolveOtherReviewTag(row)).toBeNull();
  });
});

function makeOtherReviewFakeClient(rows) {
  return {
    from() {
      return {
        select() {
          const state = { or: null };
          const builder = {
            eq(column, value) {
              state[column] = value;
              return builder;
            },
            or(filterString) {
              state.or = filterString;
              return builder;
            },
            gt() {
              return builder;
            },
            order() {
              return builder;
            },
            limit(n) {
              let filtered = rows;
              if ('is_active' in state) filtered = filtered.filter((r) => r.is_active === state.is_active);
              if (state.or) {
                const clauses = state.or.split(',').map((c) => c.split('.'));
                filtered = filtered.filter((r) =>
                  clauses.some(([col, op, val]) => (op === 'is' ? r[col] === null : r[col] === val))
                );
              }
              filtered = filtered.slice(0, n);
              return Promise.resolve({
                data: filtered.map((r) => ({
                  id: r.id,
                  title: r.title,
                  description: r.description ?? null,
                  target_audience: r.target_audience ?? null,
                  target_audience_source: r.target_audience_source ?? null,
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

describe('applyOtherReviewFlag', () => {
  it('is_active=true이면서 target_audience가 NULL/ALL인 행만 스캔해 키워드 매칭 시 OTHER로 UPDATE한다', async () => {
    const rows = [
      { id: 'a', title: '무관', target_audience: null, is_active: true, raw_data: { DTLCONT: '보호자 동반 필수' } },
      { id: 'b', title: '무관', target_audience: 'ALL', is_active: true, raw_data: { DTLCONT: '누구나 참여 가능한 가족 프로그램' } },
      { id: 'c', title: '무관', target_audience: 'KIDS_PRE', is_active: true, raw_data: { DTLCONT: '보호자 동반' } },
      { id: 'd', title: '무관', target_audience: null, target_audience_source: 'MANUAL', is_active: true, raw_data: { DTLCONT: '보호자 동반' } },
      { id: 'e', title: '무관', target_audience: null, is_active: false, raw_data: { DTLCONT: '보호자 동반' } },
    ];
    const client = makeOtherReviewFakeClient(rows);

    const result = await applyOtherReviewFlag(client);

    // c/d/e는 is_active=false이거나 target_audience가 이미 실제 값이거나 MANUAL이라
    // 애초에 or() 필터(NULL/ALL만)에 안 걸리거나 MANUAL 가드로 스캔에서 제외된다.
    expect(rows.find((r) => r.id === 'a').target_audience).toBe('OTHER');
    expect(rows.find((r) => r.id === 'b').target_audience).toBe('OTHER');
    expect(rows.find((r) => r.id === 'c').target_audience).toBe('KIDS_PRE');
    expect(rows.find((r) => r.id === 'd').target_audience).toBe(null);
    expect(rows.find((r) => r.id === 'e').target_audience).toBe(null);
    expect(result.flaggedAsOther).toBe(2);
  });
});
