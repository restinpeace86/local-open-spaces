// [리뷰 탭 — "아이와 가기 좋아요" 태그 리뷰 수집](todo.md 개선사항4 5단계): "리뷰(아이와
// 함께가기좋아요) LLM 분석.. 저 뱃지 달린 리뷰 글 찾아서 거기에 왜 좋은지에 대하여..
// 찾아서." 실측 확인(2026-10-15, 아웃백스테이크하우스 판교점 사례): 리뷰 탭 정적
// __APOLLO_STATE__에 `VisitorReviewStatsResult`(집계 통계, code='kid_good'/
// displayName='아이와 가기 좋아요')와 개별 `VisitorReview` 엔티티(각자 votedKeywords
// 배열에 어떤 키워드가 달렸는지 포함)가 함께 들어있다 — 개별 리뷰의 votedKeywords에
// code='kid_good'이 있는 것만 골라 본문(body)을 추린다.
//
// [알려진 한계] 정적 페이지에는 최근 리뷰 중 일부(실측 기준 약 20건)만 들어있다 —
// 전체 리뷰(수백~수천 건)를 다 훑으려면 네이버의 추가 페이지네이션/필터 API가
// 필요한데, 이는 정적 파싱만으로는 안 되는 영역이라(Decision 037 — 여기서는
// Playwright도 아직 안 씀) 이번 범위에서는 다루지 않는다. 이 배치 안에서 kid_good
// 태그 리뷰가 하나도 안 보이면(실제로 없을 수도, 혹은 그 정적 배치에 없을 수도)
// 빈 배열을 반환하고, 호출부가 그 사실을 LLM 프롬프트에 명시한다(추측 금지).
import { parseApolloState, denormalizeApolloValue, fetchHtml } from './apollo-state.mjs';

const KID_GOOD_CODE = 'kid_good';

export function buildReviewUrl(placeId) {
  return `https://pcmap.place.naver.com/restaurant/${placeId}/review/visitor`;
}

export function extractKidGoodReviewBodies(html) {
  const state = parseApolloState(html);
  if (!state) return [];

  const reviewKeys = Object.keys(state).filter((k) => k.startsWith('VisitorReview:'));
  const bodies = [];
  for (const key of reviewKeys) {
    const review = denormalizeApolloValue(state, state[key]);
    const hasKidGood = Array.isArray(review.votedKeywords) && review.votedKeywords.some((kw) => kw.code === KID_GOOD_CODE);
    if (hasKidGood && typeof review.body === 'string' && review.body.trim()) {
      bodies.push(review.body.trim());
    }
  }
  return bodies;
}

export async function fetchKidGoodReviewBodies(placeId) {
  const { html, status } = await fetchHtml(buildReviewUrl(placeId));
  if (!html) return { bodies: [], status };
  return { bodies: extractKidGoodReviewBodies(html), status };
}
