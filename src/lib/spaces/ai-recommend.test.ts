import { describe, expect, it } from 'vitest';
import { rankAiRecommendedSpots } from './ai-recommend';
import { NearbyItem } from '@/lib/spaces/get-nearby';

function buildItem(overrides: Partial<NearbyItem> & { id: string }): NearbyItem {
  return {
    name: `장소-${overrides.id}`,
    category: 'CULTURE',
    distance_meters: 1000,
    item_type: 'SPACE',
    lng: 127,
    lat: 37.5,
    address: null,
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: null,
    is_free: null,
    info_url: null,
    is_kids_friendly: null,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: null,
    booking_status: null,
    category_min: '공원',
    // [AI 추천은 노출 중분류 있는 스팟만](2026-09-25 사용자 지시): 필터 기준이
    // service_category_id로 바뀌어, 기본값도 채워둔다(오버라이드 없는 나머지
    // 테스트는 계속 "노출 중분류 있음" 상태로 통과해야 한다).
    service_category_id: 'svc-park',
    ...overrides,
  };
}

describe('rankAiRecommendedSpots', () => {
  it('service_category_id(노출 중분류)가 없는 항목은 추천 대상에서 제외한다', () => {
    const items = [
      buildItem({ id: '1', service_category_id: null }),
      buildItem({ id: '2', service_category_id: 'svc-park' }),
    ];
    const result = rankAiRecommendedSpots(items);
    expect(result.map((i) => i.id)).toEqual(['2']);
  });

  // [AI 추천은 노출 중분류 있는 스팟만](2026-09-25 사용자 지시): 레거시
  // category_min은 채워져 있어도(예: "아파트 놀이터") service_category_id가
  // 없으면 여전히 제외돼야 한다 — 정확히 사용자가 지적한 실측 사례.
  it('category_min은 있어도 service_category_id가 없으면(아직 노출 중분류 미매핑) 제외한다', () => {
    const items = [
      buildItem({ id: '1', category_min: '아파트 놀이터', service_category_id: null }),
      buildItem({ id: '2', category_min: '공원', service_category_id: 'svc-park' }),
    ];
    const result = rankAiRecommendedSpots(items);
    expect(result.map((i) => i.id)).toEqual(['2']);
  });

  it('가깝고 나들이 편의성이 높은 장소가 더 먼/편의성 낮은 장소보다 우선한다', () => {
    const far = buildItem({ id: 'far', distance_meters: 4900, is_kids_friendly: false, has_parking: false });
    const near = buildItem({
      id: 'near',
      distance_meters: 200,
      is_kids_friendly: true,
      has_parking: true,
      stroller_accessible: true,
      is_free: true,
    });
    const result = rankAiRecommendedSpots([far, near]);
    expect(result[0].id).toBe('near');
  });

  it('한 카테고리가 추천 목록을 독점하지 않고 카테고리별로 골고루 섞인다', () => {
    const items = [
      buildItem({ id: 'park-1', category_min: '공원', distance_meters: 100 }),
      buildItem({ id: 'park-2', category_min: '공원', distance_meters: 200 }),
      buildItem({ id: 'park-3', category_min: '공원', distance_meters: 300 }),
      buildItem({ id: 'library-1', category_min: '도서관', distance_meters: 4000 }),
    ];
    const result = rankAiRecommendedSpots(items, 2);
    const categories = new Set(result.map((i) => i.category_min));
    // 상위 2건을 뽑을 때 공원이 압도적으로 가까워도(도서관 4000m vs 공원 100~300m)
    // 라운드로빈 방식이라 도서관도 포함되어야 한다.
    expect(categories.has('도서관')).toBe(true);
  });

  it('limit 개수만큼만 반환한다', () => {
    const items = Array.from({ length: 20 }, (_, i) => buildItem({ id: `p${i}`, distance_meters: i * 100 }));
    const result = rankAiRecommendedSpots(items, 5);
    expect(result).toHaveLength(5);
  });
});
