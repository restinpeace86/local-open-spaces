import { NearbyItem } from '@/lib/spaces/get-nearby';

// [스팟픽 AI 추천](2026-08-29 사용자 지시): "AI 추천" 칩 선택 시 별도 페이지 이동 없이
// 지도 화면 위 바텀시트로 나들이 장소를 추천한다. 사용자가 명시적으로 "기존 데이터 기반
// 스마트 정렬"을 택했다(LLM 실시간 호출 없음 — 응답 지연/비용/레이트리밋 리스크 회피,
// 즉시 응답 가능). 실제 LLM을 부르지 않으므로 "AI가 고른다"는 결과를 재현 가능한 규칙
// 기반 점수로 흉내낸다: 거리(가까울수록), 나들이 편의성(키즈친화/주차/유모차), 무료 여부를
// 가중합해 점수를 매기고, 한 카테고리가 추천 목록을 독점하지 않도록 카테고리별 라운드로빈으로
// 뽑는다.
const DIVERSITY_LIMIT = 8;
const PROXIMITY_NORMALIZE_METERS = 5000;

function scoreItem(item: NearbyItem): number {
  let score = 0;
  // 거리 점수: 반경(5km) 대비 가까울수록 높음, 반경 밖이면 0점 처리(음수 방지).
  score += Math.max(0, 1 - item.distance_meters / PROXIMITY_NORMALIZE_METERS) * 40;
  if (item.is_kids_friendly) score += 20;
  if (item.has_parking) score += 15;
  if (item.stroller_accessible) score += 15;
  if (item.is_free) score += 10;
  if (item.thumbnail_url) score += 5;
  return score;
}

// 점수 내림차순 정렬 후, 카테고리(category_min)별로 순서대로 하나씩 뽑아 상위 항목이
// 특정 카테고리에 쏠리지 않게 한다(예: 공원만 8개가 아니라 공원/도서관/박물관 등 골고루).
export function rankAiRecommendedSpots(items: NearbyItem[], limit = DIVERSITY_LIMIT): NearbyItem[] {
  const scored = items
    .filter((item) => item.category_min)
    .map((item) => ({ item, score: scoreItem(item) }))
    .sort((a, b) => b.score - a.score);

  const byCategory = new Map<string, typeof scored>();
  for (const entry of scored) {
    const key = entry.item.category_min as string;
    const bucket = byCategory.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      byCategory.set(key, [entry]);
    }
  }

  const buckets = Array.from(byCategory.values());
  const result: NearbyItem[] = [];
  let round = 0;
  while (result.length < limit && buckets.some((bucket) => round < bucket.length)) {
    for (const bucket of buckets) {
      if (round < bucket.length) result.push(bucket[round].item);
      if (result.length >= limit) break;
    }
    round += 1;
  }

  return result;
}
