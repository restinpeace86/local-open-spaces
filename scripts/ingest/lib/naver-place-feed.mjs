// [네이버 플레이스 공지 주간 배치](2026-09-25 사용자 지시): "1주일마다 배치로.. 소식
// 가져온거에 대하여 1주일이 지났는지 체크하고.. 갱신" — src/lib/admin/naver-place-crawler.ts
// 의 공지(feed) 관련 함수만 그대로 옮겼다(scripts/는 TS를 직접 import하지 않는 기존
// 관례 — 제5장 제4조, category-min-groups.mjs/facility-classification.mjs와 동일 패턴).
// 그 파일의 parseApolloState/denormalizeApolloValue/buildNaverPlaceFeedUrl/
// extractNaverPlaceFeedItems와 완전히 동일하게 유지해야 한다 — 한쪽만 고치면 어긋난다.

// HTML 안의 `window.__APOLLO_STATE__ = {...};` 대입문에서 JSON 객체 리터럴만 뽑아 파싱한다.
export function parseApolloState(html) {
  const match = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|<\/script>)/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Apollo Client 정규화 캐시 — 값이 { __ref: "TypeName:id" } 형태면 실제 객체로 치환한다.
export function denormalizeApolloValue(state, value, seen = new Set()) {
  if (Array.isArray(value)) return value.map((v) => denormalizeApolloValue(state, v, seen));
  if (value && typeof value === 'object') {
    const ref = value.__ref;
    if (typeof ref === 'string') {
      if (seen.has(ref)) return null;
      const target = state[ref];
      if (target === undefined) return null;
      return denormalizeApolloValue(state, target, new Set(seen).add(ref));
    }
    const result = {};
    for (const [key, v] of Object.entries(value)) {
      result[key] = denormalizeApolloValue(state, v, seen);
    }
    return result;
  }
  return value;
}

export function buildNaverPlaceFeedUrl(placeId) {
  return `https://pcmap.place.naver.com/restaurant/${placeId}/feed`;
}

// "Feed:" 접두어로 평탄 스캔한다. isDeleted=true인 항목은 이미 삭제 처리된 공지라 제외.
export function extractNaverPlaceFeedItems(html) {
  if (!html) return [];
  const state = parseApolloState(html);
  if (!state) return [];

  const items = [];
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith('Feed:')) continue;
    const feed = denormalizeApolloValue(state, value);
    if (feed.isDeleted === true) continue;
    const media = feed.media;
    items.push({
      naverFeedId: String(feed.id ?? key.slice('Feed:'.length)),
      title: feed.title ?? null,
      content: feed.desc ?? null,
      category: feed.category ?? null,
      imageUrl: Array.isArray(media) && media[0]?.thumbnail ? media[0].thumbnail : null,
      isPinned: feed.isPinned === true,
      postedAt: feed.createdString ?? null,
    });
  }
  return items;
}
