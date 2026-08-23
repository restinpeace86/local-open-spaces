import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeView } from './home-view';
import { NearbyItem } from '@/lib/spaces/get-nearby';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

// Task 9-3-1(2026-08-22): jsdom에는 IntersectionObserver가 없어, "가성비 행복" 섹션의 지연
// 페칭을 테스트에서 직접 통제하기 위한 가짜 구현. 콜백을 저장해뒀다가 테스트에서 원하는
// 시점에 "화면에 들어옴"을 시뮬레이션한다(observe()를 실제로 호출하지 않으면 데이터는
// 영원히 Skeleton 상태로 남는다 — 실제 lazy-loading 동작을 그대로 검증하기 위함).
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
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}

function simulateFreeFeedInView() {
  const instance = FakeIntersectionObserver.instances.at(-1);
  act(() => {
    instance?.callback(
      [{ isIntersecting: true } as unknown as IntersectionObserverEntry],
      instance as unknown as IntersectionObserver
    );
  });
}

function stubFetchFreeFeed(freeFeed: NearbyItem[], themeItems: NearbyItem[] = []) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/home/free-feed')) {
      return Promise.resolve({ json: () => Promise.resolve({ freeFeed }) } as Response);
    }
    if (url.startsWith('/api/home/theme-feed')) {
      return Promise.resolve({ json: () => Promise.resolve({ items: themeItems }) } as Response);
    }
    return Promise.resolve({ json: () => Promise.resolve({ heroEvents: [] }) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function makeEventItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'event-1',
    name: '오늘의 추천 행사',
    category: 'PERFORMANCE_FESTIVAL',
    distance_meters: -1,
    item_type: 'EVENT',
    lng: 127,
    lat: 37.5,
    address: null,
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
    ...overrides,
  };
}

function makeSpaceItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'space-1',
    name: '무료 공공 공원',
    category: 'OUTDOOR_NATURE',
    distance_meters: -1,
    item_type: 'SPACE',
    lng: 127,
    lat: 37.5,
    address: '서울시 어딘가',
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: null,
    is_free: true,
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

describe('HomeView', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    // 기본값: 어떤 테스트도 실제 네트워크를 타지 않도록 빈 응답으로 스텁해둔다. 특정 데이터가
    // 필요한 테스트는 stubFetchFreeFeed()로 개별 재정의한다.
    stubFetchFreeFeed([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Hero Carousel/Quick 그리드를 홈 탭에서 즉시 렌더링한다', () => {
    render(<HomeView initialHeroEvents={[makeEventItem()]} />);

    expect(screen.getByText('오늘의 추천 행사')).toBeInTheDocument();
    // 5대 카테고리 Quick 그리드
    expect(screen.getByText('키즈·액티비티')).toBeInTheDocument();
    expect(screen.getByText('💰 가성비 행복')).toBeInTheDocument();
  });

  // Task 9-3-1: "가성비 행복" 섹션은 화면에 스크롤로 들어오기 전까지 Skeleton UI만 보여주고,
  // 실제 데이터를 페칭하지 않는다.
  it('"가성비 행복" 섹션은 화면에 보이기 전까지 Skeleton만 노출하고 데이터를 페칭하지 않는다', () => {
    const fetchMock = stubFetchFreeFeed([makeSpaceItem()]);
    render(<HomeView initialHeroEvents={[]} />);

    expect(screen.getByRole('status', { name: '가성비 행복 피드 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByText('무료 공공 공원')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('"가성비 행복" 섹션이 화면에 들어오면 /api/home/free-feed로 지연 페칭해 카드로 보여준다', async () => {
    const fetchMock = stubFetchFreeFeed([makeSpaceItem()]);
    render(<HomeView initialHeroEvents={[]} />);

    simulateFreeFeedInView();

    expect(await screen.findByText('무료 공공 공원')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/home/free-feed'));
  });

  it('오늘의 추천 행사가 없으면 안내 문구를 보여준다', () => {
    render(<HomeView initialHeroEvents={[]} />);
    expect(screen.getByText('오늘 진행 중인 추천 행사가 아직 없습니다.')).toBeInTheDocument();
  });

  it('특가·핫딜 서브탭은 비활성화 상태로 노출된다(커머스 API 미연동)', () => {
    render(<HomeView initialHeroEvents={[]} />);
    const hotdealTab = screen.getByText('🏷️ 특가·핫딜');
    expect(hotdealTab).toHaveAttribute('aria-disabled', 'true');
  });

  // Task 9-3-1: "무료·공공" 탭은 스크롤 여부와 무관하게 탭 선택 즉시 지연 페칭을 트리거한다.
  it('무료·공공 서브탭 클릭 시 지연 페칭된 무료 피드만 보여준다', async () => {
    stubFetchFreeFeed([makeSpaceItem()]);
    render(<HomeView initialHeroEvents={[makeEventItem()]} />);

    fireEvent.click(screen.getByText('🎁 무료·공공'));

    // 홈 탭 전용 섹션(가성비 행복 헤더, 퀵그리드)은 사라지고 피드 항목만 남는다
    expect(screen.queryByText('💰 가성비 행복')).not.toBeInTheDocument();
    expect(await screen.findByText('무료 공공 공원')).toBeInTheDocument();
  });

  it('카드를 클릭하면 상세 모달이 열린다', async () => {
    stubFetchFreeFeed([makeSpaceItem()]);
    render(<HomeView initialHeroEvents={[]} />);

    fireEvent.click(screen.getByText('🎁 무료·공공'));
    await screen.findByText('무료 공공 공원');
    fireEvent.click(screen.getAllByText('무료 공공 공원')[0]);

    expect(screen.getAllByText('무료 공공 공원').length).toBeGreaterThan(1);
  });

  // Task 9-1-3: "[장소명] · [시/군/구]" 카드 표기 검증(거리 계산 제거)
  // Task 9-6-8(2026-08-23): formatVenueLine이 이제 normalizeSigunguProvince로 광역 지자체
  // 접두를 방어적으로 보완해 표시한다.
  it('venue_name과 sigungu_name이 있으면 "[장소명] · [광역 지자체] [시/군/구]" 형태로 카드에 표시한다', () => {
    render(
      <HomeView
        initialHeroEvents={[makeEventItem({ address: '율동공원 야외무대', sigungu_name: '성남시 분당구' })]}
      />
    );

    expect(screen.getByText('율동공원 야외무대 · 경기도 성남시 분당구')).toBeInTheDocument();
  });

  // Task 9-1-3: 유저가 실제 위치를 설정하면(온보딩 확정 시 이미 계산돼 저장된 sigungu_name)
  // 그 값을 그대로 넘겨 홈 피드를 즉시 재조회한다(재계산 없음).
  // 사용자 피드백(2026-08-22): 실제 좌표(lat/lng)도 함께 넘겨 서버가 가까운 순으로 재정렬하도록 한다.
  it('유저 위치가 설정돼 있으면 저장된 sigungu_name과 좌표로 /api/home/feed를 재조회한다(Hero만)', async () => {
    localStorage.setItem(
      'user_location',
      JSON.stringify({
        lat: 37.4,
        lng: 127.2,
        address_name: '경기도 성남시 분당구',
        sigungu_name: '성남시 분당구',
      })
    );

    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/home/feed')) {
        return Promise.resolve({
          json: () => Promise.resolve({ heroEvents: [makeEventItem({ id: 'refetched', name: '재조회된 행사' })] }),
        } as Response);
      }
      return Promise.resolve({ json: () => Promise.resolve({ freeFeed: [] }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HomeView initialHeroEvents={[makeEventItem()]} />);

    expect(await screen.findByText('재조회된 행사')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/home/feed?sigungu=${encodeURIComponent('성남시 분당구')}&lat=37.4&lng=127.2`
    );
  });

  // 사용자 피드백(2026-08-22): 헤더 위치 표기가 상세 도로명주소라서 검색바를 가릴 정도였다 —
  // 짧은 sigunguName을 우선 보여줘야 한다.
  it('헤더 위치 표기는 상세 주소가 아니라 짧은 sigunguName을 보여준다', () => {
    localStorage.setItem(
      'user_location',
      JSON.stringify({
        lat: 37.4,
        lng: 127.2,
        address_name: '경기도 성남시 분당구 판교로 546번길 15 (판교동, 코너스퀘어)',
        sigungu_name: '성남시 분당구',
      })
    );

    render(<HomeView initialHeroEvents={[]} />);

    expect(screen.getByText('성남시 분당구')).toBeInTheDocument();
    expect(
      screen.queryByText('경기도 성남시 분당구 판교로 546번길 15 (판교동, 코너스퀘어)')
    ).not.toBeInTheDocument();
  });

  // Task 9-1-9: 메인 카드(Hero Carousel)는 처음 10개만 슬라이드로 보여주고, 11번째 이상은
  // 마지막 슬라이드의 "전체 보기" CTA 카드로 대체한다(더 이상 아래에 펼치지 않음).
  // Task 9-6-6(2026-08-23): 지도(/nearby)도 상시 공간 카탈로그(/region)도 아니라 오늘 진행 중인
  // 행사 전용 카드 그리드 페이지(/events/today)로 연동돼야 한다.
  it('Hero Carousel 항목이 10개를 넘으면 마지막 슬라이드로 "전체 보기" CTA 카드를 보여준다', () => {
    const heroEvents = Array.from({ length: 12 }, (_, i) =>
      makeEventItem({ id: `hero-${i}`, name: `오늘의 행사 ${i}` })
    );
    render(<HomeView initialHeroEvents={heroEvents} />);

    expect(screen.getByText('오늘의 행사 0')).toBeInTheDocument();
    expect(screen.getByText('오늘의 행사 9')).toBeInTheDocument();
    // 11/12번째는 카드로 보이지 않고, 대신 "전체 보기" CTA만 노출된다.
    expect(screen.queryByText('오늘의 행사 10')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘의 행사 11')).not.toBeInTheDocument();

    const link = screen.getByText('오늘 진행 중인 전체 행사 보기').closest('a');
    expect(link).toHaveAttribute('href', '/events/today');
  });

  it('Hero Carousel 항목이 10개 이하면 "전체 보기" CTA 카드를 보여주지 않는다', () => {
    const heroEvents = Array.from({ length: 5 }, (_, i) =>
      makeEventItem({ id: `hero-${i}`, name: `오늘의 행사 ${i}` })
    );
    render(<HomeView initialHeroEvents={heroEvents} />);

    expect(screen.queryByText('오늘 진행 중인 전체 행사 보기')).not.toBeInTheDocument();
  });

  // Task 9-5-1(2026-08-22)/9-6-4(2026-08-23): 대분류별 테마 칩 검증. 기본 대분류는
  // "🎪 행사·축제"(EVENTS)이므로 기본으로 보이는 칩은 EVENT_THEME_OPTIONS(물놀이·수영 등)다.
  describe('테마별 추천 (Task 9-5-1/9-6-4)', () => {
    it('기본 상태에서는 어떤 테마도 선택돼 있지 않아 안내 문구만 보여준다', () => {
      render(<HomeView initialHeroEvents={[]} />);
      expect(screen.getByText('🎪 테마별 행사')).toBeInTheDocument();
      expect(screen.getByText('테마를 선택하면 관련 스팟을 보여드려요.')).toBeInTheDocument();
    });

    it('테마 칩을 클릭하면 /api/home/theme-feed를 호출해 해당 테마 스팟을 보여준다', async () => {
      const fetchMock = stubFetchFreeFeed([], [makeSpaceItem({ id: 'pool-1', name: '분당 수영장' })]);
      render(<HomeView initialHeroEvents={[]} />);

      fireEvent.click(screen.getByText('🏊 물놀이·수영'));

      expect(await screen.findByText('분당 수영장')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/home/theme-feed?theme=SWIMMING'));
    });

    it('다른 테마 칩을 다시 누르면 그 테마로 새로 페칭한다', async () => {
      const items: Record<string, NearbyItem[]> = {
        SWIMMING: [makeSpaceItem({ id: 'pool-1', name: '분당 수영장' })],
        PLAYGROUND_KIDS: [makeSpaceItem({ id: 'playground-1', name: '분당 키즈놀이터' })],
      };
      const fetchMock = vi.fn((url: string) => {
        const theme = new URL(url, 'http://localhost').searchParams.get('theme') ?? '';
        return Promise.resolve({ json: () => Promise.resolve({ items: items[theme] ?? [] }) } as Response);
      });
      vi.stubGlobal('fetch', fetchMock);
      render(<HomeView initialHeroEvents={[]} />);

      fireEvent.click(screen.getByText('🏊 물놀이·수영'));
      expect(await screen.findByText('분당 수영장')).toBeInTheDocument();

      fireEvent.click(screen.getByText('🛝 놀이터·키즈'));
      expect(await screen.findByText('분당 키즈놀이터')).toBeInTheDocument();
      expect(screen.queryByText('분당 수영장')).not.toBeInTheDocument();
    });

    it('최상위 대분류를 "🏞️ 상시 장소"로 전환하면 공간 전용 테마 칩(5개)이 보이고 이전 선택은 초기화된다', async () => {
      stubFetchFreeFeed([], [makeSpaceItem({ id: 'pool-1', name: '분당 수영장' })]);
      render(<HomeView initialHeroEvents={[]} />);

      fireEvent.click(screen.getByText('🏊 물놀이·수영'));
      expect(await screen.findByText('분당 수영장')).toBeInTheDocument();

      fireEvent.click(screen.getByText('🏞️ 상시 장소'));

      expect(screen.getByText('🏞️ 테마별 장소')).toBeInTheDocument();
      expect(screen.getByText('🌳 공원·광장')).toBeInTheDocument();
      expect(screen.getByText('🏊 야외 수영장·물놀이터')).toBeInTheDocument();
      // 이전 대분류(EVENTS)의 칩 선택/결과는 초기화된다.
      expect(screen.queryByText('분당 수영장')).not.toBeInTheDocument();
      expect(screen.getByText('테마를 선택하면 관련 스팟을 보여드려요.')).toBeInTheDocument();
    });
  });

  // Task 9-1-11: "0원의 행복" → "가성비 행복" 서브탭 개편 검증
  describe('가성비 행복 서브탭 (Task 9-1-11)', () => {
    it('기본으로 "전체" 탭이 선택돼 있어 모든 항목을 보여준다', async () => {
      stubFetchFreeFeed([
        makeSpaceItem({ id: 'a', name: '무료 공원', is_free: true, is_kids_friendly: false }),
        makeSpaceItem({ id: 'b', name: '유료지만 무료피드에 있는 곳', is_free: false }),
      ]);
      render(<HomeView initialHeroEvents={[]} />);
      simulateFreeFeedInView();

      expect(await screen.findByText('무료 공원')).toBeInTheDocument();
      expect(screen.getByText('유료지만 무료피드에 있는 곳')).toBeInTheDocument();
    });

    it('"👶 키즈특화" 탭을 누르면 is_kids_friendly인 항목만 보여준다', async () => {
      stubFetchFreeFeed([
        makeSpaceItem({ id: 'kids', name: '키즈 전용 공간', is_kids_friendly: true }),
        makeSpaceItem({ id: 'general', name: '일반 공간', is_kids_friendly: false }),
      ]);
      render(<HomeView initialHeroEvents={[]} />);
      simulateFreeFeedInView();
      await screen.findByText('키즈 전용 공간');

      fireEvent.click(screen.getByText('👶 키즈특화'));

      expect(screen.getByText('키즈 전용 공간')).toBeInTheDocument();
      expect(screen.queryByText('일반 공간')).not.toBeInTheDocument();
    });

    it('"🎁 완전무료" 탭을 누르면 is_free===true인 항목만 보여준다', async () => {
      stubFetchFreeFeed([
        makeSpaceItem({ id: 'free', name: '완전 무료 공간', is_free: true }),
        makeSpaceItem({ id: 'paid', name: '유료 공간', is_free: false }),
      ]);
      render(<HomeView initialHeroEvents={[]} />);
      simulateFreeFeedInView();
      await screen.findByText('완전 무료 공간');

      fireEvent.click(screen.getByText('🎁 완전무료'));

      expect(screen.getByText('완전 무료 공간')).toBeInTheDocument();
      expect(screen.queryByText('유료 공간')).not.toBeInTheDocument();
    });

    it('"⚡ 당일 바로입장" 탭을 누르면 SPACE는 항상 통과하고 EVENT는 오늘 기간에 포함될 때만 통과한다', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      stubFetchFreeFeed([
        makeSpaceItem({ id: 'space', name: '상시 개방 공간' }),
        makeEventItem({ id: 'today-event', name: '오늘 진행 행사', start_date: todayStr, end_date: todayStr }),
        makeEventItem({ id: 'future-event', name: '다음 주 행사', start_date: '2099-01-01', end_date: '2099-01-02' }),
      ]);
      render(<HomeView initialHeroEvents={[]} />);
      simulateFreeFeedInView();
      await screen.findByText('상시 개방 공간');

      fireEvent.click(screen.getByText('⚡ 당일 바로입장'));

      expect(screen.getByText('상시 개방 공간')).toBeInTheDocument();
      expect(screen.getByText('오늘 진행 행사')).toBeInTheDocument();
      expect(screen.queryByText('다음 주 행사')).not.toBeInTheDocument();
    });
  });
});
