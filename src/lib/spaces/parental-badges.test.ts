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

  // Task 9-1-4(2026-08-22)에서 발견해 수정한 회귀 테스트: 주차/유모차 뱃지까지 전부 있으면
  // 4개 제한(.slice(0,4))에 밀려 4대 핵심 뱃지 중 하나인 "실내외"(facility_type)가 잘려나갔다.
  it('가성비/실내외/아이동반 핵심 뱃지는 주차·유모차 뱃지에 밀려 잘리지 않는다', () => {
    const badges = getParentalBadges(
      makeSpace({
        is_free: true,
        facility_type: '실내',
        is_kids_friendly: true,
        has_parking: true,
        stroller_accessible: true,
      })
    );
    expect(badges).toContainEqual({ key: 'facility_type', label: '실내' });
    expect(badges).toContainEqual({ key: 'is_free', label: '🎁 무료' });
    expect(badges).toContainEqual({ key: 'kids', label: '👶 키즈' });
  });
});

function makeEvent(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return { ...makeSpace(), item_type: 'EVENT', ...overrides };
}

// Task 9-1(2026-08-22): event-card.md 규약과 어긋나 있던 두 가지를 바로잡은 회귀 테스트
// (1) booking_status 원본 코드값 → 스펙 표시 문구 매핑, (2) is_free null 숨김을 event에도 동일 적용.
describe('getParentalBadges (EVENT)', () => {
  it('booking_status가 오늘방문이면 스펙 문구("오늘 당일 입장 가능")로 강조 표시한다', () => {
    const badges = getParentalBadges(makeEvent({ booking_status: '오늘방문' }));
    expect(badges).toContainEqual({ key: 'booking_status', label: '⚡ 오늘 당일 입장 가능', emphasis: true });
  });

  it('booking_status가 D-1 마감임박이면 강조 표시한다', () => {
    const badges = getParentalBadges(makeEvent({ booking_status: 'D-1 마감임박' }));
    expect(badges).toContainEqual({ key: 'booking_status', label: '⏳ D-1 마감임박', emphasis: true });
  });

  it('booking_status가 접수중이면 강조 없이 표시한다', () => {
    const badges = getParentalBadges(makeEvent({ booking_status: '접수중' }));
    expect(badges).toContainEqual({ key: 'booking_status', label: '📅 접수중', emphasis: undefined });
  });

  it('is_free === true면 완전 무료 뱃지를 노출한다', () => {
    const badges = getParentalBadges(makeEvent({ is_free: true }));
    expect(badges).toContainEqual({ key: 'is_free', label: '🎁 완전 무료' });
  });

  it('is_free === false면 유료 뱃지를 노출한다', () => {
    const badges = getParentalBadges(makeEvent({ is_free: false }));
    expect(badges).toContainEqual({ key: 'is_free', label: '💰 유료' });
  });

  it('is_free === null이면 요금 뱃지를 숨긴다 (Task 9-1에서 수정한 오탐 방지)', () => {
    const badges = getParentalBadges(makeEvent({ is_free: null }));
    expect(badges.some((b) => b.key === 'is_free')).toBe(false);
  });

  it('target_age_group이 영유아면 유아전용 뱃지를 노출한다', () => {
    const badges = getParentalBadges(makeEvent({ target_age_group: '영유아' }));
    expect(badges).toContainEqual({ key: 'kids', label: '👶 유아전용' });
  });
});
