import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeView } from './home-view';
import { NearbyItem } from '@/lib/spaces/get-nearby';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

// [Decision 019](2026-09-02): HomeView가 마운트하는 AiChatFab/AiChatSheet(이벤트픽 화면
// 챗봇)이 useUser() 훅을 쓴다 — 비로그인으로 고정해 이 파일의 기존 홈 피드 테스트에는
// 영향이 없게 한다.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

// Task 9-3-1(2026-08-22): jsdom에는 IntersectionObserver가 없어, HeroCarousel(뷰포트 이탈 시
// Autoplay 정지 로직)이 렌더링될 때 크래시하지 않도록 가짜 구현을 전역에 등록해둔다.
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

  // [홈 화면 성능 최적화](2026-08-29 사용자 지시): "지금 이 순간 함께하기 좋은 알찬 픽"/"놓치면 후회하는 인기 만점 예약 픽" 지연 페칭
  // effect가 이제 addressName 유무와 무관하게 마운트 시 항상 실행돼, 이 effect의 결과를
  // 검증하지 않는 기존 동기(sync) 테스트들에서도 테스트 종료 후 상태 업데이트가 걸려
  // "not wrapped in act(...)" 경고가 뜬다 — 다음 테스트로 넘어가기 전에 대기 중인 마이크로
  // 태스크를 한 번 비워 정리한다(테스트 결과 자체에는 영향 없음, 콘솔 경고 제거 목적).
  afterEach(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    vi.unstubAllGlobals();
  });

  it('Hero Carousel/대분류 그리드를 홈 탭에서 즉시 렌더링한다', () => {
    render(<HomeView initialHeroEvents={[makeEventItem()]} />);

    expect(screen.getByText('오늘의 추천 행사')).toBeInTheDocument();
    // [대분류·중분류 드릴다운 개편](2026-08-27) 7대 대분류 그리드
    expect(screen.getByText('문화 / 전시')).toBeInTheDocument();
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

  // Task 9-6-17(2026-08-25, docs/spec.md 2.2 ② 개정)/[대분류·중분류 드릴다운 개편](2026-08-27
  // 사용자 지시): 대분류를 누르면 중분류 칩이 펼쳐지고, 중분류를 누르면 /region으로
  // 라우팅하지 않고 이 화면 내부에서 /api/home/category-feed로 지연 페칭해 바로 아래에 카드
  // 피드를 보여준다.
  describe('대분류·중분류 드릴다운 인라인 피딩', () => {
    it('대분류 클릭 시 중분류 칩이 나타나고, 중분류 클릭 시 카드가 보인다', async () => {
      const fetchMock = stubFetchFreeFeed(
        [],
        [],
        [makeEventItem({ id: 'farm-1', name: '도시농업 체험 행사' })]
      );
      render(<HomeView initialHeroEvents={[]} />);

      // 대분류 클릭 전에는 중분류 칩("도시농업")이 없다.
      expect(screen.queryByText('도시농업')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('체험 / 농장'));
      expect(screen.getByText('도시농업')).toBeInTheDocument();

      fireEvent.click(screen.getByText('도시농업'));

      expect(await screen.findByText('도시농업 체험 행사')).toBeInTheDocument();
      const expectedParam = new URLSearchParams({ category: '도시농업' }).toString();
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/home/category-feed?${expectedParam}`));
      expect(screen.getByText('체험 / 농장').closest('a')).toBeNull();
    });

    it('다른 대분류를 클릭하면 이전 중분류 선택/카드가 초기화된다', async () => {
      stubFetchFreeFeed([], [], [makeEventItem({ id: 'farm-1', name: '도시농업 체험 행사' })]);
      render(<HomeView initialHeroEvents={[]} />);

      fireEvent.click(screen.getByText('체험 / 농장'));
      fireEvent.click(screen.getByText('도시농업'));
      expect(await screen.findByText('도시농업 체험 행사')).toBeInTheDocument();

      fireEvent.click(screen.getByText('자연 / 캠핑'));

      expect(screen.queryByText('도시농업')).not.toBeInTheDocument();
      expect(screen.queryByText('도시농업 체험 행사')).not.toBeInTheDocument();
      expect(screen.getByText('캠핑장')).toBeInTheDocument();
    });

    // [중분류 데이터 로딩 속도 개선 - 페이지네이션 도입](2026-09-04 사용자 지시): 1페이지를
    // 처음부터 전부 불러오지 않고, 필요할 때만 offset을 실어 다음 페이지를 요청해 기존
    // 카드 뒤에 이어붙인다.
    // [무한 스크롤 도입](2026-09-04 후속 지시): "더보기 버튼 말고 무한 스크롤로" — 버튼
    // 클릭 대신 바텀시트 스크롤이 바닥에 닿는 것으로 다음 페이지를 트리거한다(실제 스크롤
    // 임계값 판정 로직 자체는 major-category-grid.test.tsx에서 더 촘촘히 검증하고, 여기서는
    // HomeView→MajorCategoryGrid로 이어지는 배선 전체가 실제로 동작하는지만 확인한다).
    it('바텀시트 스크롤이 바닥에 닿으면 offset으로 다음 페이지를 요청해 이어붙인다', async () => {
      const fetchMock = vi.fn((url: string) => {
        if (url.startsWith('/api/home/category-feed')) {
          if (url.includes('offset=')) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({ items: [makeEventItem({ id: 'farm-2', name: '두 번째 페이지 행사' })], hasMore: false }),
            } as Response);
          }
          return Promise.resolve({
            json: () =>
              Promise.resolve({ items: [makeEventItem({ id: 'farm-1', name: '도시농업 체험 행사' })], hasMore: true }),
          } as Response);
        }
        if (url.startsWith('/api/home/free-feed')) {
          return Promise.resolve({ json: () => Promise.resolve({ freeFeed: [] }) } as Response);
        }
        return Promise.resolve({ json: () => Promise.resolve({ heroEvents: [] }) } as Response);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { container } = render(<HomeView initialHeroEvents={[]} />);

      fireEvent.click(screen.getByText('체험 / 농장'));
      fireEvent.click(screen.getByText('도시농업'));
      expect(await screen.findByText('도시농업 체험 행사')).toBeInTheDocument();
      expect(screen.queryByText('더보기')).not.toBeInTheDocument(); // 버튼은 더 이상 없다

      // HomeView 자체의 최상위 스크롤 컨테이너도 overflow-y-auto라 첫 매치가 아니라
      // 가장 안쪽(=바텀시트)인 마지막 매치를 찾는다.
      const scrollAreas = container.querySelectorAll('.overflow-y-auto');
      const sheetScrollArea = scrollAreas[scrollAreas.length - 1];
      Object.defineProperty(sheetScrollArea, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(sheetScrollArea, 'scrollTop', { value: 900, configurable: true });
      Object.defineProperty(sheetScrollArea, 'clientHeight', { value: 100, configurable: true });
      fireEvent.scroll(sheetScrollArea);

      expect(await screen.findByText('두 번째 페이지 행사')).toBeInTheDocument();
      // 1페이지 카드도 그대로 남아 있어야 한다(교체가 아니라 이어붙이기).
      expect(screen.getByText('도시농업 체험 행사')).toBeInTheDocument();

      const secondPageCall = fetchMock.mock.calls.map((call) => call[0]).find((url) => url.includes('offset='));
      expect(secondPageCall).toContain('offset=1');
    });
  });

  // [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시) 요구사항 1:
  // 상단 [홈 / 특가 할인 / 무료 공공] 서브탭 바를 완전히 제거했다 — 더 이상 탭 자체가
  // 존재하지 않으므로, 예전 탭 라벨이 화면에 남아있지 않은지 확인한다.
  it('상단 서브탭 바가 더 이상 렌더링되지 않는다', () => {
    render(<HomeView initialHeroEvents={[]} />);

    expect(screen.queryByText('🏠 홈')).not.toBeInTheDocument();
    expect(screen.queryByText('🏷️ 특가·핫딜')).not.toBeInTheDocument();
    expect(screen.queryByText('🎁 무료·공공')).not.toBeInTheDocument();
  });

  // [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시) 요구사항 2/3/4/5:
  // "이번 주말 실패 없는 베스트 나들이 픽" 가로 슬라이드 섹션 — 탭이 사라져 별도 클릭
  // 없이 마운트만으로 curated_items를 페칭하고, 카드는 상세 모달 없이 곧바로 booking_url을
  // 새 창으로 연다.
  // [관리자 화면 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30 사용자 지시): 데이터
  // 소스가 event_tickets → curated_items(`/api/curated-items`)로 바뀌었다.
  describe('베스트 나들이 픽 섹션', () => {
    function stubFetchBestPicks(items: unknown[]) {
      const fetchMock = vi.fn((url: string) => {
        if (url.startsWith('/api/curated-items')) {
          return Promise.resolve({ json: () => Promise.resolve({ items }) } as Response);
        }
        return Promise.resolve({ json: () => Promise.resolve({ heroEvents: [] }) } as Response);
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    function makeCuratedItem(overrides: Record<string, unknown> = {}) {
      return {
        id: 'item-1',
        title: '가을 단풍 나들이 축제 입장권',
        image_url: null,
        booking_url: 'https://example.com/tickets/autumn-festival',
        category: 'ticket',
        is_active: true,
        operation_start_date: null,
        operation_end_date: null,
        created_at: '2026-08-29T00:00:00+00:00',
        ...overrides,
      };
    }

    it('마운트되면 별도 클릭 없이 타이틀/서브 텍스트와 카드를 보여준다', async () => {
      stubFetchBestPicks([makeCuratedItem()]);
      render(<HomeView initialHeroEvents={[]} />);

      expect(await screen.findByText('이번 주말 실패 없는 베스트 나들이 픽')).toBeInTheDocument();
      expect(screen.getByText('에디터가 직접 검증한 나들이 코스만 엄선했어요.')).toBeInTheDocument();
      expect(await screen.findByText('가을 단풍 나들이 축제 입장권')).toBeInTheDocument();
    });

    it('카드를 클릭하면 상세 모달 없이 booking_url을 새 창(target=_blank)으로 곧바로 연다', async () => {
      stubFetchBestPicks([makeCuratedItem()]);
      render(<HomeView initialHeroEvents={[]} />);

      const link = (await screen.findByText('가을 단풍 나들이 축제 입장권')).closest('a');
      expect(link).toHaveAttribute('href', 'https://example.com/tickets/autumn-festival');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });

    // [큐레이션 카드 내부 '이미지 vs 텍스트' 영역 비율 고정](2026-08-30 사용자 지시):
    // 제목 줄바꿈 여부와 무관하게 카드 전체 높이가 항상 동일해야 한다 — 바깥 래퍼가
    // 폭/높이를 고정하고, 카드 내부는 flex flex-col h-full로 이미지/텍스트 영역을 나눈다.
    it('제목 길이가 다르든 카드 바깥 래퍼의 크기(w-36 h-[220px])는 항상 동일하다', async () => {
      stubFetchBestPicks([
        makeCuratedItem({ id: 't1', title: '짧은 제목' }),
        makeCuratedItem({ id: 't2', title: '아주 아주 아주 아주 아주 긴 제목의 상품입니다' }),
      ]);
      render(<HomeView initialHeroEvents={[]} />);

      const short = (await screen.findByText('짧은 제목')).closest('a')!.parentElement!;
      const long = screen.getByText('아주 아주 아주 아주 아주 긴 제목의 상품입니다').closest('a')!.parentElement!;

      expect(short).toHaveClass('w-36', 'h-[220px]');
      expect(long).toHaveClass('w-36', 'h-[220px]');
    });

    it('베스트 픽이 0건이면 섹션 자체를 숨긴다', async () => {
      stubFetchBestPicks([]);
      render(<HomeView initialHeroEvents={[]} />);

      await waitFor(() => {
        expect(screen.queryByLabelText('베스트 나들이 픽')).not.toBeInTheDocument();
      });
    });

    it('"지금 이 순간 함께하기 좋은 알찬 픽"과 "놓치면 후회하는 인기 만점 예약 픽" 섹션 사이에 위치한다', async () => {
      // "지금 이 순간 함께하기 좋은 알찬 픽"/"놓치면 후회하는 인기 만점 예약 픽" 섹션은 0건이면 숨겨지므로(가변 노출), 이 테스트에서는
      // 둘 다 실제로 렌더링되도록 /api/home/feed 응답에 최소 1건씩 채워 넣는다.
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/curated-items')) {
            return Promise.resolve({ json: () => Promise.resolve({ items: [makeCuratedItem()] }) } as Response);
          }
          if (url.startsWith('/api/home/feed')) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  heroEvents: [],
                  currentlyOngoingEvents: [makeEventItem({ id: 'ongoing-1' })],
                  reservationOpenEvents: [makeEventItem({ id: 'reservation-1' })],
                }),
            } as Response);
          }
          return Promise.resolve({ json: () => Promise.resolve({}) } as Response);
        })
      );
      const { container } = render(<HomeView initialHeroEvents={[]} />);
      await screen.findByText('가을 단풍 나들이 축제 입장권');

      const labels = Array.from(container.querySelectorAll('section[aria-label]')).map((el) =>
        el.getAttribute('aria-label')
      );
      const ongoingIndex = labels.indexOf('지금 이 순간 함께하기 좋은 알찬 픽');
      const bestPickIndex = labels.indexOf('베스트 나들이 픽');
      const reservationIndex = labels.indexOf('놓치면 후회하는 인기 만점 예약 픽');

      expect(ongoingIndex).toBeGreaterThanOrEqual(0);
      expect(bestPickIndex).toBeGreaterThan(ongoingIndex);
      expect(reservationIndex).toBeGreaterThan(bestPickIndex);
    });

    // [홈 화면 대분류 그리드 최상단 배치](2026-09-03 사용자 지시): "자연/캠핑, 공공
    // 키즈카페 등 대분류가 맨 아래에 있다 — 오늘 마감/오늘 한정 뱃지가 뜨는 행사 카드
    // 영역(오늘의 추천 행사)보다 위로 올려달라"는 지적에 따라 이 섹션을 화면의 첫
    // 콘텐츠 섹션으로 옮겼다.
    it('"카테고리별 행사"(대분류 그리드)가 다른 모든 시한성 이벤트 섹션보다 먼저 나온다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/curated-items')) {
            return Promise.resolve({ json: () => Promise.resolve({ items: [makeCuratedItem()] }) } as Response);
          }
          if (url.startsWith('/api/home/feed')) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  // heroEvents는 일부러 생략한다 — Array.isArray(undefined)가 false라
                  // HomeView가 initialHeroEvents prop 값을 그대로 유지한다(마운트 시
                  // 재조회로 덮어써 0건이 되면 "오늘의 추천 행사" 섹션이 숨겨져 이
                  // 테스트가 검증하려는 순서를 확인할 수 없다).
                  currentlyOngoingEvents: [makeEventItem({ id: 'ongoing-1' })],
                  reservationOpenEvents: [makeEventItem({ id: 'reservation-1' })],
                }),
            } as Response);
          }
          return Promise.resolve({ json: () => Promise.resolve({}) } as Response);
        })
      );
      const { container } = render(<HomeView initialHeroEvents={[makeEventItem({ id: 'hero-1' })]} />);
      await screen.findByText('가을 단풍 나들이 축제 입장권');

      const labels = Array.from(container.querySelectorAll('section[aria-label]')).map((el) =>
        el.getAttribute('aria-label')
      );
      const categoryGridIndex = labels.indexOf('카테고리별 행사');
      const heroIndex = labels.indexOf('오늘의 추천 행사');
      const ongoingIndex = labels.indexOf('지금 이 순간 함께하기 좋은 알찬 픽');
      const bestPickIndex = labels.indexOf('베스트 나들이 픽');
      const reservationIndex = labels.indexOf('놓치면 후회하는 인기 만점 예약 픽');

      expect(categoryGridIndex).toBe(0);
      expect(heroIndex).toBeGreaterThan(categoryGridIndex);
      expect(ongoingIndex).toBeGreaterThan(categoryGridIndex);
      expect(bestPickIndex).toBeGreaterThan(categoryGridIndex);
      expect(reservationIndex).toBeGreaterThan(categoryGridIndex);
    });
  });

  // [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시)로 "🎁 무료·공공"
  // 탭이 제거되어, DetailModal이 열리는 동일한 메커니즘(onSelect={setSelectedItem})을
  // 여전히 쓰는 Hero Carousel 카드 클릭으로 검증 대상을 바꿨다.
  it('카드를 클릭하면 상세 모달이 열린다', async () => {
    render(<HomeView initialHeroEvents={[makeEventItem()]} />);

    fireEvent.click(screen.getByText('오늘의 추천 행사'));

    expect(screen.getAllByText('오늘의 추천 행사').length).toBeGreaterThan(1);
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
  it('유저 위치가 설정돼 있으면 저장된 sigungu_name과 좌표로 /api/home/feed를 재조회한다', async () => {
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

    // [홈 화면 성능 최적화](2026-08-29 사용자 지시): useUserLocation의 localStorage 읽기가
    // 마운트 이후 effect에서 비동기로 끝나 addressName이 null→값 순으로 바뀌므로, 이 재조회
    // effect가 (a) 주소 미확정 상태로 한 번, (b) 주소 확정 후 다시 한 번, 총 두 번 호출될 수
    // 있다 — 정확한 파라미터를 실은 호출이 "그 중 하나"이기만 하면 된다(호출 횟수 자체는
    // 검증 대상이 아님). URLSearchParams는 공백을 %20이 아니라 +로 인코딩하므로 문자열
        // 그대로 비교하지 않고 파싱해서 비교한다.
    const matchedExpectedCall = fetchMock.mock.calls.some(([url]) => {
      const params = new URL(url as string, 'http://localhost').searchParams;
      return params.get('sigungu') === '성남시 분당구' && params.get('lat') === '37.4' && params.get('lng') === '127.2';
    });
    expect(matchedExpectedCall).toBe(true);
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
  // [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시) 요구사항 3: 더 이상 /events/today로 이동하지
  // 않고, 같은 화면 위 바텀시트(EventBrowseSheet)가 뜬다.
  it('Hero Carousel 항목이 10개를 넘으면 마지막 슬라이드로 "전체 보기" CTA 카드를 보여주고, 누르면 바텀시트가 뜬다', async () => {
    const heroEvents = Array.from({ length: 12 }, (_, i) =>
      makeEventItem({ id: `hero-${i}`, name: `오늘의 행사 ${i}` })
    );
    render(<HomeView initialHeroEvents={heroEvents} />);

    expect(screen.getByText('오늘의 행사 0')).toBeInTheDocument();
    expect(screen.getByText('오늘의 행사 9')).toBeInTheDocument();
    // 11/12번째는 카드로 보이지 않고, 대신 "전체 보기" CTA만 노출된다.
    expect(screen.queryByText('오늘의 행사 10')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘의 행사 11')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('오늘 진행 중인 전체 행사 보기'));
    expect(await screen.findByText('🎪 오늘 전체보기')).toBeInTheDocument();
  });

  // [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시) 요구사항 3: "지금 이 순간 함께하기 좋은 알찬 픽"/"놓치면 후회하는 인기 만점 예약 픽"의
  // "전체보기"도 페이지 이동(/events/ongoing, /events/reservation-open) 대신 바텀시트로 뜬다.
  it('"지금 이 순간 함께하기 좋은 알찬 픽"/"놓치면 후회하는 인기 만점 예약 픽" 전체보기를 누르면 각각 해당 바텀시트가 뜬다', async () => {
    // 위치 온보딩 모달도 동일한 aria-label="닫기" 닫기 버튼을 쓰므로, 위치를 미리 설정해
    // 온보딩 모달이 함께 뜨는 것을 막아 이 시트의 닫기 버튼만 유일하게 남긴다.
    localStorage.setItem(
      'user_location',
      JSON.stringify({ lat: 37.4, lng: 127.2, address_name: '경기도 성남시 분당구', sigungu_name: '성남시 분당구' })
    );
    // [홈 화면 성능 최적화](2026-08-29 사용자 지시): 이 두 섹션은 더 이상 initial props가
    // 아니라 마운트 후 /api/home/feed 지연 페칭으로 채워진다.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/home/feed')) {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                heroEvents: [],
                currentlyOngoingEvents: [makeEventItem({ id: 'ongoing-1', name: '진행중 행사' })],
                reservationOpenEvents: [makeEventItem({ id: 'reservation-1', name: '예약가능 행사' })],
              }),
          } as Response);
        }
        return Promise.resolve({ json: () => Promise.resolve({ freeFeed: [] }) } as Response);
      })
    );

    render(<HomeView initialHeroEvents={[]} />);

    await screen.findByText('진행중 행사');
    await screen.findByText('예약가능 행사');

    fireEvent.click(screen.getByText('지금 이 순간 함께하기 좋은 알찬 픽').parentElement!.querySelector('button')!);
    expect(await screen.findByText('지금 이 순간 함께하기 좋은 알찬 픽 전체보기')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('닫기'));

    fireEvent.click(screen.getByText('놓치면 후회하는 인기 만점 예약 픽').parentElement!.querySelector('button')!);
    expect(await screen.findByText('놓치면 후회하는 인기 만점 예약 픽 전체보기')).toBeInTheDocument();
  });

  // [홈 화면 성능 최적화](2026-08-29 사용자 지시) 요구사항 2: "지금 이 순간 함께하기 좋은 알찬 픽"/"놓치면 후회하는 인기 만점 예약 픽"은
  // 더 이상 SSR로 채워지지 않고 마운트 후 클라이언트에서 지연 페칭된다 — 그동안 스켈레톤을
  // 먼저 보여줘야 한다.
  describe('홈 슬라이드 Lazy Loading', () => {
    it('데이터 도착 전에는 스켈레톤을 보여주고, 도착 후 실제 카드로 바뀐다', async () => {
      let resolveFeed: (value: { json: () => Promise<unknown> }) => void = () => {};
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/home/feed')) {
            return new Promise((resolve) => {
              resolveFeed = resolve;
            });
          }
          return Promise.resolve({ json: () => Promise.resolve({ freeFeed: [] }) } as Response);
        })
      );

      render(<HomeView initialHeroEvents={[]} />);

      expect(screen.getByLabelText('지금 이 순간 함께하기 좋은 알찬 픽 불러오는 중')).toBeInTheDocument();
      expect(screen.getByLabelText('놓치면 후회하는 인기 만점 예약 픽 불러오는 중')).toBeInTheDocument();
      // 로딩 중에는 아직 몇 건인지 몰라 "전체보기" 버튼을 노출하지 않는다.
      expect(screen.queryByText('전체보기 →')).not.toBeInTheDocument();

      resolveFeed({
        json: () =>
          Promise.resolve({
            heroEvents: [],
            currentlyOngoingEvents: [makeEventItem({ id: 'ongoing-1', name: '진행중 행사' })],
            reservationOpenEvents: [makeEventItem({ id: 'reservation-1', name: '예약가능 행사' })],
          }),
      });

      expect(await screen.findByText('진행중 행사')).toBeInTheDocument();
      expect(screen.getByText('예약가능 행사')).toBeInTheDocument();
      expect(screen.queryByLabelText('지금 이 순간 함께하기 좋은 알찬 픽 불러오는 중')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('놓치면 후회하는 인기 만점 예약 픽 불러오는 중')).not.toBeInTheDocument();
    });

    it('로드 결과가 0건이면 스켈레톤 대신 섹션 자체를 숨긴다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/home/feed')) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({ heroEvents: [], currentlyOngoingEvents: [], reservationOpenEvents: [] }),
            } as Response);
          }
          return Promise.resolve({ json: () => Promise.resolve({ freeFeed: [] }) } as Response);
        })
      );

      render(<HomeView initialHeroEvents={[]} />);

      await waitFor(() => {
        expect(screen.queryByLabelText('지금 이 순간 함께하기 좋은 알찬 픽 불러오는 중')).not.toBeInTheDocument();
      });
      expect(screen.queryByLabelText(/지금 이 순간 함께하기 좋은 알찬 픽/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/놓치면 후회하는 인기 만점 예약 픽/)).not.toBeInTheDocument();
      expect(screen.queryByText('지금 이 순간 함께하기 좋은 알찬 픽')).not.toBeInTheDocument();
      expect(screen.queryByText('놓치면 후회하는 인기 만점 예약 픽')).not.toBeInTheDocument();
    });
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
    // [UI/UX 개선 및 기능 수정](2026-09-01 사용자 지시) 항목 2: "테마별 행사 영역"을
    // 화면에서 숨긴다 — 관련 state/조회 로직은 그대로 두고(되돌리기 쉽게) `hidden`
    // 속성만 적용했으므로, DOM에는 여전히 존재하되 hidden이 true여야 한다.
    it('테마별 행사 섹션은 hidden 속성으로 화면에서 숨겨진다', () => {
      render(<HomeView initialHeroEvents={[]} />);
      const section = screen.getByText('🎪 테마별 행사').closest('section');
      expect(section).toHaveAttribute('hidden');
    });

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
