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
    ...overrides,
  };
}

describe('rankAiRecommendedSpots', () => {
  it('category_min이 없는 항목은 추천 대상에서 제외한다', () => {
    const items = [buildItem({ id: '1', category_min: null }), buildItem({ id: '2', category_min: '공원' })];
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
