// spec/data/ai-rule.md 3의 표준 카테고리 정의를 기준으로 지도 마커 색상/한글 라벨을 매핑한다.
const CATEGORY_META: Record<string, { color: string; label: string }> = {
  PARK: { color: '#22c55e', label: '공원' },
  SPORTS: { color: '#f97316', label: '체육시설' },
  CULTURE: { color: '#a855f7', label: '문화기반시설' },
  FESTIVAL: { color: '#ef4444', label: '축제' },
  EXHIBITION: { color: '#ec4899', label: '전시' },
  PERFORMANCE: { color: '#3b82f6', label: '공연' },
  POPUP: { color: '#eab308', label: '팝업' },
  RESERVATION: { color: '#14b8a6', label: '예약형 행사' },
  // Decision 008 — 5대 UI 카테고리 (spec/data/ai-rule.md 3.3, scripts/ingest/adapters/lib/schema-mapper.mjs)
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

// spec/common/search.md 2.3: 카테고리 및 유형 필터 칩 목록
export const CATEGORY_FILTER_OPTIONS = Object.keys(CATEGORY_META).map((category) => ({
  category,
  ...CATEGORY_META[category],
}));

const SPACE_CATEGORIES = ['PARK', 'SPORTS', 'CULTURE'];
export const SPACE_CATEGORY_FILTER_OPTIONS = CATEGORY_FILTER_OPTIONS.filter((opt) =>
  SPACE_CATEGORIES.includes(opt.category)
);

// Task 9-1(2026-08-22): 홈 화면 5대 카테고리 Quick 그리드용 — docs/spec.md 3.2에 명시된 순서 그대로.
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
