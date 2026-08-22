// Task 9-1-4(2026-08-22): spec/data/ai-rule.md 3.3(Decision 008)에 따라 레거시 원본 카테고리
// (PARK/SPORTS/CULTURE/FESTIVAL/EXHIBITION/PERFORMANCE/POPUP/RESERVATION) 표기를 완전히
// 제거하고 5대 UI 카테고리로 통일했다 — 수집 파이프라인(schema-mapper.mjs/category-map.mjs)이
// 이제 이 5개 값만 만들어내고, 기존 DB의 레거시 값도 백필 마이그레이션으로 전량 정리했다.
const CATEGORY_META: Record<string, { color: string; label: string }> = {
  EXPERIENCE_CLASS: { color: '#f43f5e', label: '체험·클래스' },
  OUTDOOR_NATURE: { color: '#16a34a', label: '야외·자연' },
  EXHIBITION_MUSEUM: { color: '#8b5cf6', label: '전시·박물관' },
  PERFORMANCE_FESTIVAL: { color: '#0ea5e9', label: '공연·축제' },
  KIDS_ACTIVITY: { color: '#f59e0b', label: '키즈·액티비티' },
};

const DEFAULT_META = { color: '#6b7280', label: '기타' };

export function getCategoryMeta(category: string) {
  return CATEGORY_META[category] ?? DEFAULT_META;
}

// docs/spec.md 3.2에 명시된 순서 그대로 — 홈 Quick 그리드, /region 카테고리 선택 화면,
// /nearby 카테고리 필터 칩이 모두 이 하나의 목록을 공유한다.
const UI_CATEGORIES = [
  'EXPERIENCE_CLASS',
  'OUTDOOR_NATURE',
  'EXHIBITION_MUSEUM',
  'PERFORMANCE_FESTIVAL',
  'KIDS_ACTIVITY',
];
export const UI_CATEGORY_FILTER_OPTIONS = UI_CATEGORIES.map((category) => ({
  category,
  ...CATEGORY_META[category],
}));
