import { describe, expect, it } from 'vitest';
import { getDateBannerBadge, getReservationAvailabilityTag } from './event-status';
import { NearbyItem } from './get-nearby';

function makeEvent(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: '1',
    name: '테스트 행사',
    category: 'PERFORMANCE_FESTIVAL',
    distance_meters: -1,
    item_type: 'EVENT',
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

const TODAY = new Date('2026-08-25T00:00:00');

// Task 9-6-13: 메인카드 배너 2종 유형 분리 검증
describe('getDateBannerBadge', () => {
  it('start_date === end_date === 오늘이면 "오늘 한정" 배너를 반환한다', () => {
    const badge = getDateBannerBadge(
      makeEvent({ start_date: '2026-08-25', end_date: '2026-08-25' }),
      TODAY
    );
    expect(badge).toEqual({ label: '⚡ 오늘 한정', kind: 'today_only' });
  });

  it('다일간 행사이고 end_date가 오늘이면 "오늘 마감" 배너를 반환한다', () => {
    const badge = getDateBannerBadge(
      makeEvent({ start_date: '2026-08-20', end_date: '2026-08-25' }),
      TODAY
    );
    expect(badge).toEqual({ label: '⏰ 오늘 마감', kind: 'ending_today' });
  });

  it('end_date가 오늘이 아니면 배너를 반환하지 않는다', () => {
    const badge = getDateBannerBadge(
      makeEvent({ start_date: '2026-08-20', end_date: '2026-08-26' }),
      TODAY
    );
    expect(badge).toBeNull();
  });

  it('SPACE 항목에는 배너를 반환하지 않는다', () => {
    const badge = getDateBannerBadge(
      makeEvent({ item_type: 'SPACE', start_date: '2026-08-25', end_date: '2026-08-25' }),
      TODAY
    );
    expect(badge).toBeNull();
  });
});

// Task 9-6-13: 예약 버튼 미존재 시 예약 필요/불필요 안내 태그 검증
describe('getReservationAvailabilityTag', () => {
  it('reservation_url이 있으면 태그를 반환하지 않는다', () => {
    const tag = getReservationAvailabilityTag(makeEvent({ reservation_url: 'https://example.com' }));
    expect(tag).toBeNull();
  });

  it('reservation_url이 없고 is_reservation_required면 "사전예약필요(링크미제공)" 태그를 반환한다', () => {
    const tag = getReservationAvailabilityTag(
      makeEvent({ reservation_url: null, is_reservation_required: true })
    );
    expect(tag).toEqual({ label: '📋 사전예약필요 (링크미제공)', tone: 'warn' });
  });

  it('reservation_url이 없고 예약 불필요면 "예약불필요/현장방문" 태그를 반환한다', () => {
    const tag = getReservationAvailabilityTag(
      makeEvent({ reservation_url: null, is_reservation_required: false })
    );
    expect(tag).toEqual({ label: '✅ 예약불필요 / 현장방문', tone: 'neutral' });
  });

  it('SPACE 항목에는 태그를 반환하지 않는다', () => {
    const tag = getReservationAvailabilityTag(makeEvent({ item_type: 'SPACE', reservation_url: null }));
    expect(tag).toBeNull();
  });
});
