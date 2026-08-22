import { ThemeSpotKey } from './theme-spots';

// Task 9-6-4(2026-08-23): 홈 화면 최상위 대분류 — "🎪 행사·축제"(기본, events)와
// "🏞️ 상시 장소"(open_spaces)를 나눈다. 각 대분류는 자신만의 5개 하위 테마 칩을 갖는다.
// 기존 "🏞️ 목적별 추천 스팟" 섹션(6개 ThemeSpotKey를 events+open_spaces 혼합으로 노출)을
// 대체한다 — 세 번째 별도 칩 시스템을 만드는 대신, 이미 존재하는 ThemeSpotKey/키워드 매칭
// 인프라(theme-spots.ts)를 그대로 재사용하고, 대분류별로 다른 라벨/부분집합만 새로 정의한다
// (제5장 제4조 기존 구조 우선).
export type HomeCategory = 'EVENTS' | 'SPACES';

export const HOME_CATEGORY_OPTIONS: { key: HomeCategory; label: string }[] = [
  { key: 'EVENTS', label: '🎪 행사·축제' },
  { key: 'SPACES', label: '🏞️ 상시 장소' },
];

// "🎪 행사·축제" 하위 칩 — events는 source_type 컬럼이 없어 전부 키워드 ILIKE로만 분류된다
// (confidentSourceTypesFor가 항상 빈 배열을 반환해도 정상 동작함).
export const EVENT_THEME_OPTIONS: { key: ThemeSpotKey; label: string; emoji: string }[] = [
  { key: 'SWIMMING', label: '물놀이·수영', emoji: '🏊' },
  { key: 'PLAYGROUND_KIDS', label: '놀이터·키즈', emoji: '🛝' },
  { key: 'AMUSEMENT_ACTIVITY', label: '유원지·액티비티', emoji: '🎡' },
  { key: 'CULTURE_SPORTS', label: '전시·공연·문화', emoji: '🏛️' },
  { key: 'EXPERIENCE_NATURE', label: '체험·자연', emoji: '🌿' },
];

// "🏞️ 상시 장소" 하위 칩 — 사용자가 지정한 5개 목록에는 기존 6개 ThemeSpotKey 중
// AMUSEMENT_ACTIVITY(유원지)가 빠져 있다(의도적 — 기존 /nearby·region-grid-view.tsx의
// 카테고리 픽커에서는 계속 노출되므로 데이터 자체가 사라지는 것은 아니다).
export const SPACE_THEME_OPTIONS: { key: ThemeSpotKey; label: string; emoji: string }[] = [
  { key: 'PARK_WALK', label: '공원·광장', emoji: '🌳' },
  { key: 'PLAYGROUND_KIDS', label: '어린이 놀이터', emoji: '🛝' },
  { key: 'SWIMMING', label: '야외 수영장·물놀이터', emoji: '🏊' },
  { key: 'FOREST_RECREATION', label: '국립공원·수목원·휴양림', emoji: '🌲' },
  { key: 'CULTURE_SPORTS', label: '박물관·미술관·체육시설', emoji: '🏛️' },
];

export function themeOptionsFor(category: HomeCategory): { key: ThemeSpotKey; label: string; emoji: string }[] {
  return category === 'EVENTS' ? EVENT_THEME_OPTIONS : SPACE_THEME_OPTIONS;
}

// HomeCategory → getFreeFeed/getThemeSpotFeed의 dataType 파라미터 값.
export function dataTypeFor(category: HomeCategory): 'events' | 'open_spaces' {
  return category === 'EVENTS' ? 'events' : 'open_spaces';
}
