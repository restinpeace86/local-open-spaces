import { act, fireEvent, render, screen } from '@testing-library/react';
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

// Task 9-1-9: 당일 진행 중인 항목과, 부족분을 채운 "이번 주 마감임박" 항목을 뱃지로 구분 표시.
describe('HeroCarousel 뱃지 구분 (Task 9-1-9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00+09:00'));
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('오늘 진행 중인 항목(start_date<=오늘<=end_date)은 "오늘 당일 입장" 뱃지를 보여준다', () => {
    const item = makeItem('1', '오늘 행사');
    item.start_date = '2026-08-22';
    item.end_date = '2026-08-22';

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.getByText('⚡ 오늘 당일 입장 가능')).toBeInTheDocument();
    expect(screen.queryByText('🔥 D-DAY 마감임박')).not.toBeInTheDocument();
  });

  it('오늘 진행 중이 아닌(이번 주 시작 예정) 항목은 "D-DAY 마감임박" 뱃지를 보여준다', () => {
    const item = makeItem('2', '다음 주 행사');
    item.start_date = '2026-08-25';
    item.end_date = '2026-08-27';

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.getByText('🔥 D-DAY 마감임박')).toBeInTheDocument();
    expect(screen.queryByText('⚡ 오늘 당일 입장 가능')).not.toBeInTheDocument();
  });
});

// Task 9-1-9: 후보가 10개를 넘겨 HomeView가 moreHref를 넘기면 마지막 슬라이드로 "전체 보기"
// CTA 카드가 노출되고, 지도 화면(오늘/주말 Quick 필터 활성)으로 연동된다.
describe('HeroCarousel "전체 보기" CTA (Task 9-1-9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moreHref가 있으면 마지막 슬라이드로 "오늘 진행 중인 전체 행사 보기" 링크를 노출한다', () => {
    const items = [makeItem('1', '행사1'), makeItem('2', '행사2')];
    render(<HeroCarousel items={items} onSelect={() => {}} moreHref="/nearby?filter=TODAY_WEEKEND" />);

    const link = screen.getByText('오늘 진행 중인 전체 행사 보기').closest('a');
    expect(link).toHaveAttribute('href', '/nearby?filter=TODAY_WEEKEND');
  });

  it('moreHref가 없으면 "전체 보기" CTA 카드를 노출하지 않는다', () => {
    const items = [makeItem('1', '행사1')];
    render(<HeroCarousel items={items} onSelect={() => {}} />);

    expect(screen.queryByText('오늘 진행 중인 전체 행사 보기')).not.toBeInTheDocument();
  });
});
