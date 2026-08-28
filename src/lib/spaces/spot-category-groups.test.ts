import { describe, expect, it } from 'vitest';
import { SPOT_CATEGORY_GROUPS, isKnownSpotCategoryMin } from './spot-category-groups';

describe('SPOT_CATEGORY_GROUPS', () => {
  it('4개 대분류로 구성된다', () => {
    expect(SPOT_CATEGORY_GROUPS).toHaveLength(4);
  });

  it('관리 전용/시설 대관류(강당, 회의실 등)와 기타는 포함하지 않는다', () => {
    const allMinors = SPOT_CATEGORY_GROUPS.flatMap((g) => g.minors);
    expect(allMinors).not.toContain('강당');
    expect(allMinors).not.toContain('회의실');
    expect(allMinors).not.toContain('청년공간');
    expect(allMinors).not.toContain('기타');
    expect(allMinors).not.toContain('민원 등 기타');
  });

  it('같은 중분류가 두 대분류에 중복 배정되지 않는다', () => {
    const allMinors = SPOT_CATEGORY_GROUPS.flatMap((g) => g.minors);
    expect(new Set(allMinors).size).toBe(allMinors.length);
  });
});

describe('isKnownSpotCategoryMin', () => {
  it('그룹에 속한 값은 true를 반환한다', () => {
    expect(isKnownSpotCategoryMin('공원')).toBe(true);
    expect(isKnownSpotCategoryMin('키즈카페')).toBe(true);
  });

  it('그룹에 없는 값(관리 전용 등)은 false를 반환한다', () => {
    expect(isKnownSpotCategoryMin('강당')).toBe(false);
    expect(isKnownSpotCategoryMin('완전히새로운값')).toBe(false);
  });
});
