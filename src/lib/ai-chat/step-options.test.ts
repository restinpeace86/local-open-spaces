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

// [챗봇 카테고리 체계 동기화](2026-09-03 사용자 지시): 이벤트픽 7대 대분류 중 스포츠
// 대여를 뺀 6가지로 확정.
describe('VIBE_OPTIONS', () => {
  it('이벤트픽 대분류와 동기화된 6개 카테고리를 정의한다', () => {
    expect(VIBE_OPTIONS).toHaveLength(6);
    expect(VIBE_OPTIONS.map((o) => o.label)).toEqual([
      '자연 / 캠핑',
      '공공 키즈카페',
      '체험 / 농장',
      '축제 / 이벤트',
      '문화 / 전시',
      '배움 / 클래스',
    ]);
  });
});

// [챗봇 문제점 수정](2026-09-02 사용자 지시) 5: 분위기 다중 선택 + "전체" 라벨 조합.
describe('buildVibeLabel', () => {
  it('빈 배열이면 "전체"', () => {
    expect(buildVibeLabel([])).toBe('전체');
  });
  it('1개 선택이면 그 라벨 그대로', () => {
    expect(buildVibeLabel(['NATURE_CAMPING'])).toBe('자연 / 캠핑');
  });
  it('여러 개 선택이면 · 로 이어붙인다', () => {
    expect(buildVibeLabel(['KIDS_CAFE', 'NATURE_CAMPING'])).toBe('공공 키즈카페 · 자연 / 캠핑');
  });
});
