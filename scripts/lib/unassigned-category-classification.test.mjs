import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CATEGORY_MINS,
  buildCategoryMinClassificationPrompt,
  parseCategoryMinClassificationResponse,
} from './unassigned-category-classification.mjs';

describe('buildCategoryMinClassificationPrompt', () => {
  it('각 행의 시설명/주소를 번호와 함께 포함한다', () => {
    const prompt = buildCategoryMinClassificationPrompt([
      { name: '중랑캠핑숲', address: '서울 중랑구 송림길 160' },
      { name: '용마산유아숲체험장', address: '서울 중랑구 용마산로94길 64-126' },
    ]);
    expect(prompt).toContain('1. 시설명: 중랑캠핑숲 | 주소: 서울 중랑구 송림길 160');
    expect(prompt).toContain('2. 시설명: 용마산유아숲체험장 | 주소: 서울 중랑구 용마산로94길 64-126');
  });

  it('표준중분류 후보 목록 전체를 포함한다', () => {
    const prompt = buildCategoryMinClassificationPrompt([{ name: 'A', address: 'B' }]);
    expect(prompt).toContain('어린이놀이터');
    expect(prompt).toContain('종합/기타박물관');
    expect(prompt).not.toContain('민원 등 기타');
  });

  it('명칭/주소가 없으면 (없음)으로 표시하고 추측 금지 안내를 포함한다', () => {
    const prompt = buildCategoryMinClassificationPrompt([{ name: '', address: '' }]);
    expect(prompt).toContain('(없음)');
    expect(prompt).toContain('추측');
  });

  it('JSON 배열 길이가 행 수와 정확히 일치해야 한다는 안내를 포함한다', () => {
    const prompt = buildCategoryMinClassificationPrompt(new Array(20).fill({ name: 'X', address: 'Y' }));
    expect(prompt).toContain('정확히 20개');
  });
});

describe('parseCategoryMinClassificationResponse', () => {
  it('유효한 JSON 배열을 index 순서대로 매핑한다', () => {
    const json = JSON.stringify([
      { index: 1, category_min: '어린이놀이터' },
      { index: 2, category_min: '공원' },
    ]);
    expect(parseCategoryMinClassificationResponse(json, 2)).toEqual(['어린이놀이터', '공원']);
  });

  it('UNASSIGNED는 null(미지정 유지)로 변환한다', () => {
    const json = JSON.stringify([{ index: 1, category_min: 'UNASSIGNED' }]);
    expect(parseCategoryMinClassificationResponse(json, 1)).toEqual([null]);
  });

  it('허용 목록에 없는 값(환각)은 무시하고 null로 유지한다(추측 금지)', () => {
    const json = JSON.stringify([{ index: 1, category_min: '존재하지않는카테고리' }]);
    expect(parseCategoryMinClassificationResponse(json, 1)).toEqual([null]);
  });

  it('마크다운 코드 블록으로 감싸져 와도 벗겨내고 파싱한다', () => {
    const json = JSON.stringify([{ index: 1, category_min: '공원' }]);
    expect(parseCategoryMinClassificationResponse(`\`\`\`json\n${json}\n\`\`\``, 1)).toEqual(['공원']);
  });

  it('JSON 파싱 자체가 실패하면 null이다', () => {
    expect(parseCategoryMinClassificationResponse('이건 JSON이 아닙니다', 5)).toBeNull();
  });

  it('배열이 아니면 null이다', () => {
    expect(parseCategoryMinClassificationResponse('{"index":1}', 1)).toBeNull();
  });

  it('일부 index가 누락돼도 나머지는 정상 매핑하고 누락분은 null로 둔다', () => {
    const json = JSON.stringify([{ index: 2, category_min: '체육관' }]);
    expect(parseCategoryMinClassificationResponse(json, 3)).toEqual([null, '체육관', null]);
  });

  it('범위를 벗어난 index는 무시한다', () => {
    const json = JSON.stringify([{ index: 99, category_min: '체육관' }]);
    expect(parseCategoryMinClassificationResponse(json, 3)).toEqual([null, null, null]);
  });
});

describe('ALLOWED_CATEGORY_MINS', () => {
  it('필터성 값(기타/민원 등 기타)은 제외한다', () => {
    expect(ALLOWED_CATEGORY_MINS).not.toContain('기타');
    expect(ALLOWED_CATEGORY_MINS).not.toContain('민원 등 기타');
  });

  it('중복 없이 56개다', () => {
    expect(new Set(ALLOWED_CATEGORY_MINS).size).toBe(ALLOWED_CATEGORY_MINS.length);
    expect(ALLOWED_CATEGORY_MINS).toHaveLength(56);
  });
});
