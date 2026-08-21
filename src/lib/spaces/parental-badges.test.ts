import { describe, expect, it } from 'vitest';
import { getParentalBadges } from './parental-badges';
import { NearbyItem } from './get-nearby';

// spec/space/space-card.md 'Parental Checkpoint Badges' 검증 (Task 3: DB 재태깅
// 마이그레이션으로 반영된 has_parking/stroller_accessible/is_kids_friendly 뱃지가
// 카드 UI 로직(getParentalBadges)에서 정상 표출되는지 점검)
function makeSpace(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: '1',
    name: '테스트 공간',
    category: 'OUTDOOR_NATURE',
    distance_meters: 100,
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
    ...overrides,
  };
}

describe('getParentalBadges (SPACE)', () => {
  it('is_free === true면 무료 뱃지를 노출한다', () => {
    const badges = getParentalBadges(makeSpace({ is_free: true }));
    expect(badges).toContainEqual({ key: 'is_free', label: '🎁 무료' });
  });

  it('is_free === false면 유료 뱃지를 노출한다', () => {
    const badges = getParentalBadges(makeSpace({ is_free: false }));
    expect(badges).toContainEqual({ key: 'is_free', label: '💰 유료' });
  });

  it('is_free === null이면 요금 뱃지를 숨긴다 (오탐 방지)', () => {
    const badges = getParentalBadges(makeSpace({ is_free: null }));
    expect(badges.some((b) => b.key === 'is_free')).toBe(false);
  });

  it('has_parking === true면 주차가능 뱃지를 노출한다', () => {
    const badges = getParentalBadges(makeSpace({ has_parking: true }));
    expect(badges).toContainEqual({ key: 'parking', label: '🅿️ 주차가능' });
  });

  it('stroller_accessible === true면 유모차가능 뱃지를 노출한다', () => {
    const badges = getParentalBadges(makeSpace({ stroller_accessible: true }));
    expect(badges).toContainEqual({ key: 'stroller', label: '🛺 유모차가능' });
  });

  it('is_kids_friendly === true면 키즈 뱃지를 노출한다', () => {
    const badges = getParentalBadges(makeSpace({ is_kids_friendly: true }));
    expect(badges).toContainEqual({ key: 'kids', label: '👶 키즈' });
  });

  it('보조 뱃지가 false/null이면 노출하지 않는다', () => {
    const badges = getParentalBadges(
      makeSpace({ has_parking: false, stroller_accessible: false, is_kids_friendly: false })
    );
    expect(badges.some((b) => ['parking', 'stroller', 'kids'].includes(b.key))).toBe(false);
  });
});
