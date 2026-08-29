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

// [EventCard 이미지:텍스트 4:6 포션 고정](2026-08-29 사용자 지시): 카드 고정 높이 안에서
// 이미지/텍스트 영역이 flex-[4]/flex-[6]로 정확히 나뉘는지 검증한다(사용자 확인: 중분류
// 태그·상태 라벨·마감임박 배너는 이미지 위 오버레이로 그대로 유지).
describe('EventCard 이미지:텍스트 4:6 포션', () => {
  it('이미지 영역은 flex-[4], 텍스트 영역은 flex-[6]으로 고정된다', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} />);

    const title = screen.getByText('도시농업 체험');
    const textArea = title.parentElement!;
    const imageArea = textArea.previousElementSibling!;

    expect(imageArea).toHaveClass('flex-[4]');
    expect(textArea).toHaveClass('flex-[6]');
  });

  it('이미지는 object-cover로 꽉 채워 찌그러짐을 방지한다', () => {
    const { container } = render(
      <EventCard item={makeEventItem({ thumbnail_url: 'https://example.com/thumb.jpg' })} onSelect={() => {}} />
    );

    const img = container.querySelector('img');
    expect(img).toHaveClass('w-full', 'h-full', 'object-cover');
  });

  it('제목은 line-clamp-2로 줄 수가 제한된다', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} />);

    expect(screen.getByText('도시농업 체험')).toHaveClass('line-clamp-2');
  });
});
