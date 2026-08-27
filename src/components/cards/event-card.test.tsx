import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventCard } from './event-card';
import { NearbyItem } from '@/lib/spaces/get-nearby';

function makeEventItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'event-1',
    name: '도시농업 체험',
    category: 'EXPERIENCE_CLASS',
    category_min: '도시농업',
    distance_meters: -1,
    item_type: 'EVENT',
    lng: 127,
    lat: 37.5,
    address: null,
    thumbnail_url: null,
    start_date: '2026-08-27',
    end_date: '2026-08-27',
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: false,
    operating_hours: null,
    is_free: true,
    info_url: null,
    is_kids_friendly: true,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: '초등',
    booking_status: null,
    ...overrides,
  };
}

// [카드 표준 중분류 표시](2026-08-27 사용자 지시)
describe('EventCard 표준 중분류 뱃지', () => {
  it('category_min이 있으면 event_type 라벨 대신 그 값을 뱃지로 보여준다', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} />);

    expect(screen.getByText('도시농업')).toBeInTheDocument();
    expect(screen.queryByText('체험·클래스')).not.toBeInTheDocument();
  });

  it('category_min이 없으면 기존 event_type 라벨로 폴백한다', () => {
    render(<EventCard item={makeEventItem({ category_min: null })} onSelect={() => {}} />);

    expect(screen.getByText('체험·클래스')).toBeInTheDocument();
  });
});

// [카드 뱃지 문구 정리](2026-08-27 사용자 지시)
describe('EventCard hideBadgeKeys', () => {
  it('hideBadgeKeys에 포함된 뱃지는 렌더링하지 않는다(키즈/어린이 뱃지 숨김)', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} hideBadgeKeys={['kids']} />);

    expect(screen.queryByText('👶 키즈/어린이')).not.toBeInTheDocument();
  });

  it('hideBadgeKeys를 넘기지 않으면 기존처럼 모든 뱃지를 보여준다', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} />);

    expect(screen.getByText('👶 키즈/어린이')).toBeInTheDocument();
  });

  it('무료 뱃지는 "완전 무료"가 아니라 "무료"로 표시된다', () => {
    render(<EventCard item={makeEventItem({ is_free: true })} onSelect={() => {}} />);

    expect(screen.getByText('🎁 무료')).toBeInTheDocument();
    expect(screen.queryByText('🎁 완전 무료')).not.toBeInTheDocument();
  });
});
