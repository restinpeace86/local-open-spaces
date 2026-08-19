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
