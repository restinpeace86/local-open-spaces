// [네이버 플레이스 상호명 검색](todo.md 개선사항4 1~2단계): "네이버 지도(플레이스) 검색창에
// 상호명 입력 후 검색 → 검색 결과 리스트 파싱". 실측 확인: map.naver.com/p/search/<검색어>를
// 브라우저로 열면 내부적으로 pcmap.place.naver.com/place/list?query=<검색어>...를 iframe으로
// 띄우는데, 이 list 페이지 자체가 다른 네이버 플레이스 페이지들과 동일하게 서버 렌더링
// (__APOLLO_STATE__ 정적 포함)이라 Playwright 없이 fetch만으로 검색 결과를 그대로 받을 수
// 있다(실측 확인, 2026-10-15) — 검색 결과 항목은 `PlaceListBusinessesItem:<id>` 엔티티로
// id/name/roadAddress/address/fullAddress/x/y가 전부 들어있다.
import { parseApolloState, denormalizeApolloValue, fetchHtml } from './apollo-state.mjs';

export function buildSearchUrl(query) {
  const encoded = encodeURIComponent(query);
  return `https://pcmap.place.naver.com/place/list?query=${encoded}&display=20&locale=ko&svcName=map_pcv5&searchText=${encoded}`;
}

export function extractSearchResults(html) {
  const state = parseApolloState(html);
  if (!state) return [];

  const keys = Object.keys(state).filter((k) => k.startsWith('PlaceListBusinessesItem:'));
  return keys
    .map((key) => denormalizeApolloValue(state, state[key]))
    .filter((item) => item && item.id && item.name)
    .map((item) => ({
      id: String(item.id),
      name: item.name,
      category: item.category ?? null,
      roadAddress: item.roadAddress ?? null,
      address: item.address ?? null,
      fullAddress: item.fullAddress ?? null,
      lng: item.x ? Number(item.x) : null,
      lat: item.y ? Number(item.y) : null,
    }));
}

// status를 함께 반환해(naver-crawl/route.ts와 동일한 이유) 호출부가 429(레이트리밋)와
// 진짜 "검색 결과 없음"을 구분할 수 있게 한다.
export async function searchNaverPlaces(query) {
  const url = buildSearchUrl(query);
  const { html, status } = await fetchHtml(url);
  if (!html) return { results: [], status };
  return { results: extractSearchResults(html), status };
}
