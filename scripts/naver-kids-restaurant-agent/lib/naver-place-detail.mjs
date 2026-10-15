// [상세 페이지(정보 탭) 스크래핑](todo.md 개선사항4 4단계): "상세 페이지 스크래핑(홈,
// 소식, 리뷰, 정보 탭들 영역의 데이터 수집) <-- 기존에 나드리픽 앱에 네이버 플레이스
// 고유 id를 통하여 데이터 가져오는 로직 이미 존재함." naver-place-crawler.ts의 home
// 페이지 파싱(conveniences 필드 — 네이버가 업체에 등록한 편의시설 목록, 예: "주차",
// "포장", 간혹 "유아의자" 등)과 동일한 __APOLLO_STATE__ 파싱 방식을 재사용한다.
import { parseApolloState, denormalizeApolloValue, fetchHtml } from './apollo-state.mjs';

export function buildHomeUrl(placeId) {
  return `https://pcmap.place.naver.com/restaurant/${placeId}/home`;
}

export function extractConveniences(html) {
  const state = parseApolloState(html);
  if (!state) return [];

  const baseKey = Object.keys(state).find((k) => k.startsWith('PlaceDetailBase:'));
  if (!baseKey) return [];

  const base = denormalizeApolloValue(state, state[baseKey]);
  return Array.isArray(base.conveniences) ? base.conveniences : [];
}

export async function fetchPlaceConveniences(placeId) {
  const { html, status } = await fetchHtml(buildHomeUrl(placeId));
  if (!html) return { conveniences: [], status };
  return { conveniences: extractConveniences(html), status };
}
