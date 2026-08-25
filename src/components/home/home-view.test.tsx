import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeView } from './home-view';
import { NearbyItem } from '@/lib/spaces/get-nearby';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

// Task 9-3-1(2026-08-22): jsdom에는 IntersectionObserver가 없어, "경기도권 기타" 섹션(useInView
// 사용처)이 렌더링될 때 크래시하지 않도록 가짜 구현을 전역에 등록해둔다.
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

function stubFetchFreeFeed(
  freeFeed: NearbyItem[],
  themeItems: NearbyItem[] = [],
  categoryItems: NearbyItem[] = []
) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/home/free-feed')) {
      return Promise.resolve({ json: () => Promise.resolve({ freeFeed }) } as Response);
    }
    if (url.startsWith('/api/home/theme-feed')) {
      return Promise.resolve({ json: () => Promise.resolve({ items: themeItems }) } as Response);
    }
    if (url.startsWith('/api/home/category-feed')) {
      return Promise.resolve({ json: () => Promise.resolve({ items: categoryItems }) } as Response);
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
  });

  // Task 9-6-18(2026-08-25, docs/spec.md 3.2 "화면 구성 및 UI 간소화"): "가성비 행복" 필터
  // 섹션은 메인 화면에서 완전히 제거됐다(정보는 5대 카테고리/카드 뱃지로 통합 노출).
  it('"가성비 행복" 섹션은 더 이상 홈 탭에 렌더링되지 않는다', () => {
    stubFetchFreeFeed([makeSpaceItem()]);
    render(<HomeView initialHeroEvents={[]} />);

    expect(screen.queryByText('💰 가성비 행복')).not.toBeInTheDocument();
    expect(screen.queryByText('🎁 완전무료')).not.toBeInTheDocument();
    expect(screen.queryByText('👶 키즈특화')).not.toBeInTheDocument();
  });

  // Task 9-6-9(2026-08-23): 당일 한정 조건 강화로 0건인 날이 흔해져, 빈 상태 안내 문구 대신
  // 섹션 자체를 숨긴다(가변 노출 — 10개로 억지로 채우지 않는 정책과 짝을 이룸).
  it('오늘의 추천 행사가 없으면 안내 문구 없이 섹션 자체를 숨긴다', () => {
    render(<HomeView initialHeroEvents={[]} />);
    expect(screen.queryByText('오늘 진행 중인 추천 행사가 아직 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('오늘의 추천 행사')).not.toBeInTheDocument();
  });

  // Task 9-6-17(2026-08-25, docs/spec.md 2.2 ② 개정): "5대 카테고리 Quick 아이콘 그리드" 인라인
  // 피딩 — 클릭 시 /region으로 라우팅하지 않고 이 화면 내부에서 /api/home/category-feed로
  // 지연 페칭해 바로 아래에 카드 피드를 보여준다.
  describe('5대 카테고리 인라인 피딩 (Task 9-6-17)', () => {
    it('카테고리 클릭 시 /region으로 이동하지 않고 /api/home/category-feed를 호출해 카드로 보여준다', async () => {
      const fetchMock = stubFetchFreeFeed(
        [],
        [],
        [makeEventItem({ id: 'kids-1', name: '키즈 체험 행사' })]
      );
      render(<HomeView initialHeroEvents={[]} />);

      fireEvent.click(screen.getByText('키즈·액티비티'));

      expect(await screen.findByText('키즈 체험 행사')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/home/category-feed?category=KIDS_ACTIVITY')
      );
      expect(screen.getByText('키즈·액티비티').closest('a')).toBeNull();
    });
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

    // 홈 탭 전용 섹션(퀵그리드/테마별 행사)은 사라지고 피드 항목만 남는다
    expect(screen.queryByText('키즈·액티비티')).not.toBeInTheDocument();
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

    // Task 9-6-10(2026-08-23): 하단 탭 재편으로 이 화면("이벤트픽")이 항상 events만 다루게
    // 되면서 EVENTS/SPACES 대분류 토글 자체가 사라졌다 — 상시 공간은 이제 "스팟픽"(/nearby)
    // 탭이 전담한다. 이 토글 전환 시나리오를 검증하던 테스트는 더 이상 존재하지 않는 UI를
    // 다루므로 제거한다(대신 아래에서 대분류 토글이 실제로 렌더링되지 않음을 검증).
    it('EVENTS/SPACES 대분류 토글은 더 이상 렌더링되지 않는다(이 화면은 항상 events)', () => {
      render(<HomeView initialHeroEvents={[]} />);
      expect(screen.queryByText('🎪 행사·축제')).not.toBeInTheDocument();
      expect(screen.queryByText('🏞️ 상시 장소')).not.toBeInTheDocument();
    });
  });

});
