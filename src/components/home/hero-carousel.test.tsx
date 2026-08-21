import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroCarousel } from './hero-carousel';
import { NearbyItem } from '@/lib/spaces/get-nearby';

function makeItem(id: string, name: string): NearbyItem {
  return {
    id,
    name,
    category: 'PERFORMANCE_FESTIVAL',
    distance_meters: 1000,
    item_type: 'EVENT',
    lng: 127,
    lat: 37.5,
    address: '테스트 장소',
    thumbnail_url: null,
    start_date: '2026-08-22',
    end_date: '2026-08-22',
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: false,
    operating_hours: null,
    is_free: true,
    info_url: null,
    is_kids_friendly: null,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: null,
    booking_status: '오늘방문',
  };
}

// Task 9-1-1: Hero Carousel 5초 Auto-play + 호버/터치 일시정지 검증
describe('HeroCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('5초마다 다음 아이템으로 자동 전환한다(scrollIntoView 호출)', () => {
    const items = [makeItem('1', '행사1'), makeItem('2', '행사2'), makeItem('3', '행사3')];
    render(<HeroCarousel items={items} onSelect={() => {}} />);

    const scrollIntoView = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5000));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5000));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('아이템이 1개 이하면 자동 전환하지 않는다', () => {
    render(<HeroCarousel items={[makeItem('1', '행사1')]} onSelect={() => {}} />);

    act(() => vi.advanceTimersByTime(10000));
    expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('마우스 호버 중에는 자동 전환을 멈춘다', () => {
    const items = [makeItem('1', '행사1'), makeItem('2', '행사2')];
    const { container } = render(<HeroCarousel items={items} onSelect={() => {}} />);
    const track = container.firstChild as HTMLElement;

    fireEvent.mouseEnter(track);
    act(() => vi.advanceTimersByTime(10000));
    expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();

    fireEvent.mouseLeave(track);
    act(() => vi.advanceTimersByTime(5000));
    expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('터치 중에는 자동 전환을 멈춘다', () => {
    const items = [makeItem('1', '행사1'), makeItem('2', '행사2')];
    const { container } = render(<HeroCarousel items={items} onSelect={() => {}} />);
    const track = container.firstChild as HTMLElement;

    fireEvent.touchStart(track);
    act(() => vi.advanceTimersByTime(10000));
    expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();

    fireEvent.touchEnd(track);
    act(() => vi.advanceTimersByTime(5000));
    expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});
