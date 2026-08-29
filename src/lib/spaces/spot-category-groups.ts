// [스팟픽 나들이 전용 핵심 중분류 1단 필터 개편](2026-08-29 사용자 지시): 기존 대분류→중분류
// 2단 구조를 철회하고, 진짜 나들이/가족 방문 목적에 맞는 핵심 중분류만 1단 가로 칩으로
// 노출한다. 체육시설(테니스장/골프장 등)·행정/공공청사 대관류(강당/회의실/청년공간 등)처럼
// 비나들이성 항목은 필터 목록에서 완전히 제외한다.
//
// 하나의 칩이 실제 DB `category_min` 값 여러 개를 한 번에 아우르는 경우가 있다(예: "박물관"
// 칩은 '종합/기타박물관'+'역사박물관'+'미술관' 3종을 함께 포함). 실제 DB 분포(2026-08-29
// 실측: `select category_min, count(*) from open_spaces group by category_min`)를 직접
// 확인해 존재하지 않는 값을 임의로 만들지 않았다 — "문화센터"라는 category_min은 실제로
// 없어 가장 가까운 실제 값인 '문화의집'/'문화원'으로 매핑했다.
export type CoreSpotCategory = {
  id: string;
  label: string;
  emoji: string;
  // AI 추천 칩은 실제 category_min으로 필터링하는 게 아니라 별도 추천 로직(바텀시트)을
  // 여는 액션 버튼이라 minors가 빈 배열이다 — map-explorer.tsx가 이 값을 보고 일반 토글
  // 칩과 다르게 처리한다(selectedCategoryIds에 추가하지 않고 onSelectAiRecommend만 호출).
  minors: string[];
};

export const AI_RECOMMEND_CATEGORY_ID = 'ai-recommend';

export const CORE_SPOT_CATEGORIES: CoreSpotCategory[] = [
  { id: AI_RECOMMEND_CATEGORY_ID, label: 'AI 추천', emoji: '✨', minors: [] },
  { id: 'park', label: '공원', emoji: '🌳', minors: ['공원'] },
  { id: 'culture-center', label: '문화센터/문화의집', emoji: '🏛️', minors: ['문화의집', '문화원'] },
  { id: 'museum', label: '박물관(미술관 포함)', emoji: '🖼️', minors: ['종합/기타박물관', '역사박물관', '미술관'] },
  { id: 'library', label: '도서관', emoji: '📚', minors: ['도서관'] },
  { id: 'kids-cafe', label: '키즈카페', emoji: '☕', minors: ['키즈카페'] },
  {
    id: 'playground',
    label: '놀이터',
    emoji: '🛝',
    minors: ['어린이놀이터', '어린이놀이시설(야외)', '어린이놀이시설(실내)'],
  },
];

export function isKnownSpotCategoryMin(value: string): boolean {
  return CORE_SPOT_CATEGORIES.some((c) => c.minors.includes(value));
}
