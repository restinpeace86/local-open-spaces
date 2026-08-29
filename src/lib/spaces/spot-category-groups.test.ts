import { describe, expect, it } from 'vitest';
import { AI_RECOMMEND_CATEGORY_ID, CORE_SPOT_CATEGORIES, isKnownSpotCategoryMin } from './spot-category-groups';

describe('CORE_SPOT_CATEGORIES', () => {
  it('AI 추천 액션 칩 + 나들이 핵심 중분류 6종으로 구성된다', () => {
    expect(CORE_SPOT_CATEGORIES).toHaveLength(7);
    expect(CORE_SPOT_CATEGORIES[0].id).toBe(AI_RECOMMEND_CATEGORY_ID);
  });

  it('AI 추천 칩은 실제 category_min을 가지지 않는다(별도 추천 액션이라 필터 대상이 아님)', () => {
    const aiRecommend = CORE_SPOT_CATEGORIES.find((c) => c.id === AI_RECOMMEND_CATEGORY_ID);
    expect(aiRecommend?.minors).toEqual([]);
  });

  it('체육시설(테니스장 등)·행정/공공청사 대관류(강당, 회의실 등)는 포함하지 않는다', () => {
    const allMinors = CORE_SPOT_CATEGORIES.flatMap((c) => c.minors);
    expect(allMinors).not.toContain('테니스장');
    expect(allMinors).not.toContain('골프장');
    expect(allMinors).not.toContain('강당');
    expect(allMinors).not.toContain('회의실');
    expect(allMinors).not.toContain('청년공간');
    expect(allMinors).not.toContain('기타');
  });

  it('같은 category_min이 두 칩에 중복 배정되지 않는다', () => {
    const allMinors = CORE_SPOT_CATEGORIES.flatMap((c) => c.minors);
    expect(new Set(allMinors).size).toBe(allMinors.length);
  });
});

describe('isKnownSpotCategoryMin', () => {
  it('핵심 중분류 칩에 속한 값은 true를 반환한다', () => {
    expect(isKnownSpotCategoryMin('공원')).toBe(true);
    expect(isKnownSpotCategoryMin('키즈카페')).toBe(true);
    expect(isKnownSpotCategoryMin('미술관')).toBe(true);
  });

  it('제외 대상(체육시설 등)은 false를 반환한다', () => {
    expect(isKnownSpotCategoryMin('테니스장')).toBe(false);
    expect(isKnownSpotCategoryMin('완전히새로운값')).toBe(false);
  });
});
