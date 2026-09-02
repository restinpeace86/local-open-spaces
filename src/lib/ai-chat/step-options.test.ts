import { describe, expect, it } from 'vitest';
import { buildMealQuestion, buildVibeLabel, KIDS_AGE_OPTIONS, TRANSPORT_OPTIONS, VIBE_OPTIONS } from './step-options';

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

// [챗봇 문제점 수정](2026-09-02 사용자 지시) 5: 분위기 다중 선택 + "전체" 라벨 조합.
describe('buildVibeLabel', () => {
  it('빈 배열이면 "전체"', () => {
    expect(buildVibeLabel([])).toBe('전체');
  });
  it('1개 선택이면 그 라벨 그대로', () => {
    expect(buildVibeLabel(['NATURE'])).toBe('힐링 자연');
  });
  it('여러 개 선택이면 · 로 이어붙인다', () => {
    expect(buildVibeLabel(['ACTIVE', 'NATURE'])).toBe('신나게 뛰어놀기 · 힐링 자연');
  });
});
