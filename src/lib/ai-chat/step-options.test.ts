import { describe, expect, it } from 'vitest';
import { buildMealQuestion, KIDS_AGE_OPTIONS, TRANSPORT_OPTIONS, VIBE_OPTIONS } from './step-options';

describe('buildMealQuestion', () => {
  it('요구사항 예시와 동일한 문장을 만든다', () => {
    expect(buildMealQuestion('점심 전')).toBe('점심 전에 나가시는군요! 혹시 밖에서 식사도 함께 하실 예정인가요?');
  });
});

describe('KIDS_AGE_OPTIONS', () => {
  it('open_spaces.target_age_group 실제 도메인 값과 정확히 일치한다', () => {
    expect(KIDS_AGE_OPTIONS.map((o) => o.id)).toEqual(['영유아', '초등', '전연령']);
  });
});

describe('TRANSPORT_OPTIONS', () => {
  it('4단계 반경이 오름차순이다(폴백 로직이 이 순서를 전제함)', () => {
    const radii = TRANSPORT_OPTIONS.map((o) => o.radiusMeters);
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
  });
});

describe('VIBE_OPTIONS', () => {
  it('4개 성향을 정의한다', () => {
    expect(VIBE_OPTIONS).toHaveLength(4);
  });
});
