import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroCarousel } from './hero-carousel';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// Task 9-6-9(2026-08-23): jsdom에는 IntersectionObserver가 없어, 뷰포트 이탈 시 Autoplay
// 정지를 테스트에서 직접 통제하기 위한 가짜 구현. observe() 호출 시 기본값으로 즉시
// "화면에 보임"(isIntersecting: true)을 통지해, 이 옵저버를 신경 쓰지 않는 기존 테스트들이
// 그대로 통과하게 한다 — 뷰포트 이탈 시나리오를 검증하는 테스트만 simulateOutOfViewport()로
// 명시적으로 false를 통지한다.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  root = null;
  rootMargin = '';
  thresholds: ReadonlyArray<number> = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe = vi.fn(() => {
    this.callback(
      [{ isIntersecting: true } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  });
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}

function simulateOutOfViewport() {
  const instance = FakeIntersectionObserver.instances.at(-1);
  act(() => {
    instance?.callback(
      [{ isIntersecting: false } as unknown as IntersectionObserverEntry],
      instance as unknown as IntersectionObserver
    );
  });
}

function simulateInViewport() {
  const instance = FakeIntersectionObserver.instances.at(-1);
  act(() => {
    instance?.callback(
      [{ isIntersecting: true } as unknown as IntersectionObserverEntry],
      instance as unknown as IntersectionObserver
    );
  });
}

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

// 파일 전체 공용: 모든 describe 블록의 렌더링이 IntersectionObserver를 필요로 하므로(뷰포트
// 감시 훅이 항상 실행됨) 이 파일 전역에 한 번만 스텁한다.
beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  // Task 9-6-9(2026-08-23) 버그 수정: 캐러셀이 뷰포트를 벗어나면(하단 섹션 스크롤 중)
  // Autoplay가 scrollIntoView를 호출해 화면을 강제로 위로 튕기던 버그 방지.
  it('캐러셀이 뷰포트를 벗어나면 자동 전환을 멈추고, 다시 들어오면 재개한다', () => {
    const items = [makeItem('1', '행사1'), makeItem('2', '행사2')];
    render(<HeroCarousel items={items} onSelect={() => {}} />);

    simulateOutOfViewport();
    act(() => vi.advanceTimersByTime(10000));
    expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();

    simulateInViewport();
    act(() => vi.advanceTimersByTime(5000));
    expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});

// Task 9-6-13(Decision 012): 다일간 행사가 오늘 끝나는 "오늘 마감"과 원래 하루짜리인 "오늘
// 한정"을 뱃지로 구분 표시(event-status.ts의 getDateBannerBadge, EventCard와 동일 기준).
describe('HeroCarousel 뱃지 구분 (Task 9-6-13)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00+09:00'));
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('오늘 단 하루만 진행되는 행사(start_date===end_date===오늘)는 "오늘 한정" 뱃지를 보여준다', () => {
    const item = makeItem('1', '오늘 행사');
    item.start_date = '2026-08-22';
    item.end_date = '2026-08-22';

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.getByText('⚡ 오늘 한정')).toBeInTheDocument();
    expect(screen.queryByText('⏰ 오늘 마감')).not.toBeInTheDocument();
  });

  it('여러 날 진행되다 오늘이 종료일인 행사는 "오늘 마감" 뱃지를 보여준다', () => {
    const item = makeItem('2', '여러 날 행사');
    item.start_date = '2026-08-20';
    item.end_date = '2026-08-22';

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.getByText('⏰ 오늘 마감')).toBeInTheDocument();
    expect(screen.queryByText('⚡ 오늘 한정')).not.toBeInTheDocument();
  });

  // [개선사항2](2026-09-04 사용자 지시): "오늘 한정/오늘 마감 뱃지를 다시 선명하게" —
  // 무료/유료 뱃지와 한 줄에 끼어 있던 작은 알약 대신, EventCard와 동일하게 이미지
  // 상단을 가로지르는 전체 폭 스트립(+ z-10)으로 노출되는지 검증한다.
  it('"오늘 한정" 뱃지는 무료/유료 뱃지와 분리된 이미지 상단 전체 폭 스트립으로 노출된다', () => {
    const item = makeItem('1', '오늘 행사');
    item.start_date = '2026-08-22';
    item.end_date = '2026-08-22';
    item.is_free = true;

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    const banner = screen.getByText('⚡ 오늘 한정');
    expect(banner).toHaveClass('left-0', 'right-0', 'z-10');
    // 무료 뱃지는 이 스트립과 같은 요소가 아니라 별도 컨테이너에 있어야 한다.
    const freeBadge = screen.getByText('🎁 무료');
    expect(banner.parentElement).not.toBe(freeBadge.parentElement);
  });

  // [메인 카드 유료/무료 뱃지 누락 수정](2026-08-27 사용자 지시): is_free===false(유료)일 때
  // 아무 뱃지도 없어 요금 정보를 전혀 알 수 없었다.
  it('is_free===true면 "🎁 무료" 뱃지를 보여준다', () => {
    const item = makeItem('3', '무료 행사');
    item.is_free = true;

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.getByText('🎁 무료')).toBeInTheDocument();
    expect(screen.queryByText('💰 유료')).not.toBeInTheDocument();
  });

  it('is_free===false면 "💰 유료" 뱃지를 보여준다', () => {
    const item = makeItem('4', '유료 행사');
    item.is_free = false;

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.getByText('💰 유료')).toBeInTheDocument();
    expect(screen.queryByText('🎁 무료')).not.toBeInTheDocument();
  });

  it('is_free===null(정보 없음)이면 두 뱃지 다 숨긴다(단정 표시 방지)', () => {
    const item = makeItem('5', '요금 정보 없음');
    item.is_free = null;

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.queryByText('🎁 무료')).not.toBeInTheDocument();
    expect(screen.queryByText('💰 유료')).not.toBeInTheDocument();
  });
});

// Task 9-1-9: 후보가 10개를 넘겨 HomeView가 hasMore를 넘기면 마지막 슬라이드로 "전체 보기"
// CTA 카드가 노출된다.
// [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시): 페이지 이동 링크(moreHref) 대신 바텀시트를
// 여는 콜백(onMoreClick)을 호출하는 버튼으로 바뀌었다.
describe('HeroCarousel "전체 보기" CTA (Task 9-1-9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hasMore가 true면 마지막 슬라이드로 "오늘 진행 중인 전체 행사 보기" 버튼을 노출하고, 누르면 onMoreClick을 호출한다', () => {
    const items = [makeItem('1', '행사1'), makeItem('2', '행사2')];
    const onMoreClick = vi.fn();
    render(<HeroCarousel items={items} onSelect={() => {}} hasMore onMoreClick={onMoreClick} />);

    fireEvent.click(screen.getByText('오늘 진행 중인 전체 행사 보기'));
    expect(onMoreClick).toHaveBeenCalledTimes(1);
  });

  it('hasMore가 false면 "전체 보기" CTA 카드를 노출하지 않는다', () => {
    const items = [makeItem('1', '행사1')];
    render(<HeroCarousel items={items} onSelect={() => {}} onMoreClick={() => {}} />);

    expect(screen.queryByText('오늘 진행 중인 전체 행사 보기')).not.toBeInTheDocument();
  });
});

// Task 9-4-2(2026-08-22): 카드 개수/스와이프 상태와 무관하게 항상 노출되는 Floating 버튼.
// [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시): 페이지 이동 대신 항상 onMoreClick(바텀시트
// 열기)을 호출한다.
describe('HeroCarousel Floating "오늘 전체보기" 버튼 (Task 9-4-2/9-6-7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('아이템이 10개 이하라도(hasMore 없이도) Floating 버튼은 항상 노출되고, 누르면 onMoreClick을 호출한다', () => {
    const onMoreClick = vi.fn();
    render(<HeroCarousel items={[makeItem('1', '행사1')]} onSelect={() => {}} onMoreClick={onMoreClick} />);

    fireEvent.click(screen.getByText('⚡ 오늘 전체보기 +'));
    expect(onMoreClick).toHaveBeenCalledTimes(1);
  });
});

// Task 9-1-4: 4대 핵심 뱃지(가성비/실내외/아이동반/방문시점) 중 실내외·아이동반이 HeroCarousel에
// 아예 노출되지 않던 것을 보완했는지 검증한다(가성비·방문시점은 기존 오버레이로 이미 노출됨).
describe('HeroCarousel 4대 뱃지 보완 (Task 9-1-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('실내외(facility_type) 뱃지를 오버레이와 중복 없이 카드 본문에 보완 노출한다', () => {
    const item = makeItem('1', '실내 체험 행사');
    item.facility_type = '실내';

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.getByText('실내')).toBeInTheDocument();
  });

  // [이벤트 카드 텍스트 영역 뱃지 정리](2026-09-04 사용자 지시): 아이동반(kids) 뱃지는
  // 더 이상 어디에서도(오버레이/본문 보완 모두) 노출하지 않는다.
  it('is_kids_friendly=true여도 아이동반 뱃지를 더 이상 보여주지 않는다', () => {
    const item = makeItem('1', '실내 체험 행사');
    item.is_kids_friendly = true;

    render(<HeroCarousel items={[item]} onSelect={() => {}} />);

    expect(screen.queryByText('👶 키즈/어린이')).not.toBeInTheDocument();
  });
});
