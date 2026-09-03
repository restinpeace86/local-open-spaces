'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { useUserLocation } from '@/hooks/use-user-location';
import { HomeHeader } from '@/components/home/home-header';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { ReservationOpenSlider, ReservationOpenSliderSkeleton } from '@/components/home/reservation-open-slider';
import { BestPickSlider, BestPickSliderSkeleton, CuratedItem } from '@/components/home/best-pick-slider';
import { EventBrowseSheet, EventBrowseSheetMode } from '@/components/home/event-browse-sheet';
import { MajorCategoryGrid } from '@/components/home/major-category-grid';
import { FreeFeedSkeleton } from '@/components/home/free-feed-skeleton';
import { ThemeSpotKey } from '@/lib/theme-spots';
import { themeOptionsFor } from '@/lib/home-categories';
import { SpaceGridCard } from '@/components/region/space-grid-card';
import { EventCard } from '@/components/cards/event-card';
import { DetailModal } from '@/components/map/detail-modal';
import { LocationOnboardingModal } from '@/components/map/location-onboarding-modal';
import { AiChatFab } from '@/components/chat/ai-chat-fab';

// docs/spec.md 2.2: 메인 홈 레이아웃 스택 — Hero Carousel → 5대 카테고리 Quick 그리드 → 큐레이션 카드 피드
function FeedCard({ item, onSelect }: { item: NearbyItem; onSelect: (item: NearbyItem) => void }) {
  return item.item_type === 'EVENT' ? (
    <EventCard item={item} onSelect={onSelect} />
  ) : (
    <SpaceGridCard item={item} onSelect={onSelect} />
  );
}

// Task 9-1-9: Hero Carousel은 처음엔 이만큼만 보여주고, 10개를 넘는 나머지는 마지막 슬라이드의
// "전체 보기" CTA 카드(/events/today 연동, Task 9-6-6)로 대체한다.
const HERO_VISIBLE_COUNT = 10;

// [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시): "이번 주말 실패 없는
// 베스트 나들이 픽" 전용 데이터 훅. 상단 탭이 전부 삭제되어 더 이상 "탭 선택 시 지연
// 페칭" 트리거가 없으므로, 큐레이션 콘텐츠가 위치와 무관한 수동 큐레이션 콘텐츠라는
// 전제를 살려 마운트 시 곧바로 한 번 페칭한다("현재 이용 가능"/"예약 가능"과 동일한
// 마운트-이펙트 패턴).
// [관리자 화면 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30 사용자 지시): 데이터
// 소스를 event_tickets 전용 `/api/event-tickets`에서 범용 curated_items 테이블을 읽는
// `/api/curated-items`로 교체했다 — 어드민에서 is_active를 토글하면 이 엔드포인트의
// 응답이 그대로 바뀌어 홈 화면 노출 여부가 즉시 반영된다(요구사항: "토글 즉시 유저 홈
// 화면 노출 여부가 제어되어야 한다").
function useBestPicksFeed() {
  const [bestPicks, setBestPicks] = useState<CuratedItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/curated-items')
      .then((res) => res.json())
      .then((data: { items?: CuratedItem[] }) => {
        if (!cancelled) setBestPicks(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setBestPicks((prev) => prev ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return bestPicks;
}

// Task 9-5-1(2026-08-22): "🏞️ 목적별 추천 스팟" 칩 — 기본으로 선택된 테마가 없어(6개 중
// 임의로 하나를 고를 근거가 없음) 칩을 직접 눌렀을 때만 /api/home/theme-feed를 호출한다.
// 테마를 바꿔 누르면 그 즉시 새로 페칭한다.
function useThemeSpotFeed(region: { sigunguName: string | null; lat?: number; lng?: number }, dataType: 'events' | 'open_spaces') {
  const [selectedTheme, setSelectedTheme] = useState<ThemeSpotKey | null>(null);
  const [items, setItems] = useState<NearbyItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectTheme = useCallback(
    (theme: ThemeSpotKey) => {
      setSelectedTheme(theme);
      setItems(null);
      setIsLoading(true);

      const params = new URLSearchParams({ theme, dataType });
      if (region.sigunguName) params.set('sigungu', region.sigunguName);
      if (typeof region.lat === 'number') params.set('lat', String(region.lat));
      if (typeof region.lng === 'number') params.set('lng', String(region.lng));

      fetch(`/api/home/theme-feed?${params.toString()}`)
        .then((res) => res.json())
        // 긴급 수리(2026-08-22): API 에러 응답({ error: "..." })에는 items가 없으므로 빈
        // 배열로 안전하게 폴백한다(items가 배열이 아닌 값으로 세팅되지 않도록).
        .then((data: { items?: NearbyItem[] }) => setItems(Array.isArray(data.items) ? data.items : []))
        .catch(() => setItems([]))
        .finally(() => setIsLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region.sigunguName, region.lat, region.lng, dataType]
  );

  // Task 9-6-4: 최상위 대분류를 전환하면 이전 칩 선택/결과를 그대로 두지 않는다(다른 dataType
  // 기준으로 조회된 결과가 새 대분류 화면에 남아있지 않도록).
  const reset = useCallback(() => {
    setSelectedTheme(null);
    setItems(null);
  }, []);

  return { selectedTheme, items, isLoading, selectTheme, reset };
}

// Task 9-6-17(2026-08-25, docs/spec.md 2.2 ② 개정)/[대분류·중분류 드릴다운 개편](2026-08-27
// 사용자 지시): 카테고리 그리드 인라인 피딩 — useThemeSpotFeed와 동일한 패턴(기본 선택 없음,
// 클릭 시에만 지연 페칭). 이 화면은 항상 events만 다루므로(Task 9-6-10) dataType 파라미터는
// 넘기지 않는다. 이제 선택 대상은 event_type이 아니라 중분류(category_min) 값이다 — 대분류를
// 바꾸면 이전 중분류 선택이 더 이상 유효하지 않으므로 reset()으로 지운다.
// [중분류 데이터 로딩 속도 개선 - 페이지네이션 도입](2026-09-04 사용자 지시): "중분류
// 선택 시 데이터가 한 번에 너무 많이 불려와 로딩이 지연되는 문제"를 해결하기 위해,
// 처음엔 1페이지(20건)만 받고 "더보기" 클릭 시에만 다음 페이지를 이어붙인다(끊어읽기).
// isLoadingMore을 isLoading과 분리한 이유: 더보기 중에는 이미 보이는 카드들을
// 스켈레톤으로 가리지 않고 그대로 둔 채 버튼만 로딩 상태로 바꿔야 자연스럽다.
function useCategoryFeed(region: { sigunguName: string | null; lat?: number; lng?: number }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [items, setItems] = useState<NearbyItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    (category: string, offset: number) => {
      const params = new URLSearchParams({ category });
      if (region.sigunguName) params.set('sigungu', region.sigunguName);
      if (typeof region.lat === 'number') params.set('lat', String(region.lat));
      if (typeof region.lng === 'number') params.set('lng', String(region.lng));
      if (offset > 0) params.set('offset', String(offset));
      return fetch(`/api/home/category-feed?${params.toString()}`).then(
        (res) => res.json() as Promise<{ items?: NearbyItem[]; hasMore?: boolean }>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region.sigunguName, region.lat, region.lng]
  );

  const selectCategory = useCallback(
    (category: string) => {
      setSelectedCategory(category);
      setItems(null);
      setHasMore(false);
      setIsLoading(true);

      fetchPage(category, 0)
        .then((data) => {
          setItems(Array.isArray(data.items) ? data.items : []);
          setHasMore(Boolean(data.hasMore));
        })
        .catch(() => {
          setItems([]);
          setHasMore(false);
        })
        .finally(() => setIsLoading(false));
    },
    [fetchPage]
  );

  const loadMore = useCallback(() => {
    if (!selectedCategory || isLoadingMore) return;
    setIsLoadingMore(true);

    fetchPage(selectedCategory, items?.length ?? 0)
      .then((data) => {
        const nextItems = Array.isArray(data.items) ? data.items : [];
        setItems((prev) => [...(prev ?? []), ...nextItems]);
        setHasMore(Boolean(data.hasMore));
      })
      .catch(() => setHasMore(false))
      .finally(() => setIsLoadingMore(false));
  }, [selectedCategory, items, isLoadingMore, fetchPage]);

  const reset = useCallback(() => {
    setSelectedCategory(null);
    setItems(null);
    setHasMore(false);
  }, []);

  return { selectedCategory, items, isLoading, isLoadingMore, hasMore, selectCategory, loadMore, reset };
}

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "GNB 헤더 & 글로벌 위치 상태 공유"):
// GNB 검색은 events 테이블 전용 인라인 검색이다(스팟픽의 open_spaces 검색과 분리) — 검색어가
// 있으면 이 화면 내부에서 바로 검색 결과 카드 그리드로 전환한다(라우팅 이동 없음, 카테고리
// 인라인 피딩과 동일한 패턴). SearchBar 자체가 이미 300ms 디바운스를 적용하므로 여기서는
// 추가 디바운스 없이 바로 페칭한다.
function useEventSearch() {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<NearbyItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback((nextKeyword: string) => {
    setKeyword(nextKeyword);
    const trimmed = nextKeyword.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }

    setIsSearching(true);
    fetch(`/api/home/search?q=${encodeURIComponent(trimmed)}`)
      .then((res) => res.json())
      .then((data: { items?: NearbyItem[] }) => setResults(Array.isArray(data.items) ? data.items : []))
      .catch(() => setResults([]))
      .finally(() => setIsSearching(false));
  }, []);

  return { keyword, results, isSearching, search };
}

export function HomeView({
  initialHeroEvents,
}: {
  initialHeroEvents: NearbyItem[];
}) {
  const { center, addressName, sigunguName, isOnboardingOpen, confirmLocation, openOnboarding, closeOnboarding } =
    useUserLocation();
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  // [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시) 요구사항 3: "전체보기"가 페이지 이동 대신
  // 이 화면 위 바텀시트로 뜬다 — 어떤 종류의 전체보기를 열지만 상태로 들고 있으면 된다.
  const [browseSheetMode, setBrowseSheetMode] = useState<EventBrowseSheetMode | null>(null);
  const [heroEvents, setHeroEvents] = useState<NearbyItem[]>(initialHeroEvents);
  // [홈 화면 성능 최적화](2026-08-29 사용자 지시): 이 두 섹션은 더 이상 Server Component가
  // 미리 계산해 넘겨주지 않는다(라운드로빈 믹스 연산 포함 3개 쿼리를 SSR에서 한 번에 처리하던
  // 것이 초기 응답을 지연시키는 원인이었음) — 대신 null(아직 로드 전, 스켈레톤 노출)로 시작해
  // 마운트 직후 클라이언트에서 지연 페칭한다. Hero만 SSR로 즉시 렌더링된다.
  const [reservationOpenEvents, setReservationOpenEvents] = useState<NearbyItem[] | null>(null);
  const [currentlyOngoingEvents, setCurrentlyOngoingEvents] = useState<NearbyItem[] | null>(null);
  const { keyword: searchKeyword, results: searchResults, isSearching, search: handleSearchChange } = useEventSearch();
  const isSearchActive = searchKeyword.trim().length > 0;
  // Task 9-6-10(2026-08-23): 하단 탭 재편으로 이 화면이 "이벤트픽"(시한성 이벤트 전용)이
  // 됐다 — 상시 공간(open_spaces)은 이제 "스팟픽"(/nearby) 탭이 전담하므로, 이 화면에서는
  // 더 이상 대분류 토글 없이 항상 events만 조회한다(Task 9-6-4에서 도입한 EVENTS/SPACES
  // 토글을 제거 — home-categories.ts의 SPACES 관련 export는 /region 화면이 아직 쓰므로
  // 그대로 둔다, 이 화면의 사용만 정리).
  const dataType = 'events' as const;

  const region = { sigunguName, lat: addressName ? center.lat : undefined, lng: addressName ? center.lng : undefined };
  const bestPicks = useBestPicksFeed();
  const {
    selectedTheme,
    items: themeSpotItems,
    isLoading: isThemeSpotLoading,
    selectTheme,
  } = useThemeSpotFeed(region, dataType);
  const {
    selectedCategory,
    items: categoryFeedItems,
    isLoading: isCategoryFeedLoading,
    isLoadingMore: isCategoryFeedLoadingMore,
    hasMore: categoryFeedHasMore,
    selectCategory,
    loadMore: loadMoreCategoryFeed,
    reset: resetCategoryFeed,
  } = useCategoryFeed(region);
  // [대분류·중분류 드릴다운 개편](2026-08-27 사용자 지시): 대분류 선택은 순수 UI 상태라(조회를
  // 트리거하지 않음, 그 아래 중분류 칩 목록을 펼치는 역할만 함) 별도 로컬 state로 둔다. 실제
  // 카드 조회는 여전히 useCategoryFeed의 selectCategory(중분류 값)가 담당한다.
  const [selectedMaj, setSelectedMaj] = useState<string | null>(null);
  // [todo.md 개선사항 3](2026-09-03): 구조적으로 0건인 중분류를 바텀시트에서 미리
  // 걸러내기 위한 전역 카운트 — 화면 진입 시 한 번만 가볍게 조회한다(지역 무관값이라
  // 위치 변경으로 다시 조회할 필요 없음).
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number> | undefined>(undefined);
  useEffect(() => {
    fetch('/api/home/category-min-counts')
      .then((res) => res.json())
      .then((data: { counts?: Record<string, number> }) => {
        if (data.counts) setCategoryCounts(data.counts);
      })
      .catch(() => {
        // 조회 실패해도 카테고리 그리드는 필터링 없이(전부 노출) 정상 동작한다.
      });
  }, []);
  const handleSelectMaj = useCallback(
    (maj: string) => {
      setSelectedMaj((prev) => (prev === maj ? null : maj));
      resetCategoryFeed();
    },
    [resetCategoryFeed]
  );

  // Task 9-1-1: Server Component는 기본 지역(성남시 분당구)으로만 렌더링할 수 있으므로,
  // 유저가 실제로 위치를 설정한 경우(addressName이 채워짐)에만 좌표까지 함께 넘겨 그 지역
  // 기준으로 재조회한다. 위치 미설정 상태(addressName === null)에서는 좌표 없이 기본 지역
  // (서버가 DEFAULT_HOME_REGION으로 폴백)으로 조회한다.
  // Task 9-1-3: 위치 온보딩 확정 시 한 번만 계산해 저장해 둔 sigunguName을 그대로 넘긴다 —
  // 피드를 불러올 때마다(요청마다) 주소 문자열을 다시 파싱하지 않는다.
  // 사용자 피드백(2026-08-22): 위치가 설정/재설정되면(addressName 변경) 실제 좌표(center)도
  // 함께 넘겨, 서버가 이미 걸러둔 후보군 안에서 가까운 순서로 재정렬하도록 한다.
  // [홈 화면 성능 최적화](2026-08-29 사용자 지시): 이전에는 addressName이 없으면(대부분의
  // 첫 방문자) 이 effect 자체가 아무것도 하지 않아 "현재 이용 가능"/"예약 가능"이 항상 빈
  // 배열(SSR 기본값)로 남아 있었다 — 이제 그 두 섹션이 SSR로 채워지지 않으므로, 주소 설정
  // 여부와 무관하게 마운트 시 항상 한 번 조회해야 한다(가드 제거). heroEvents는 이미
  // SSR로 채워져 있으니 재조회는 그저 최신값으로 덮어쓰는 것뿐이라 안전하다.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sigungu: sigunguName ?? '' });
    if (addressName) {
      params.set('lat', String(center.lat));
      params.set('lng', String(center.lng));
    }

    fetch(`/api/home/feed?${params.toString()}`)
      .then((res) => res.json())
      // 긴급 수리(2026-08-22) 실측 재현: API가 500과 함께 { error: "..." }를 반환해도 이 then은
      // 그대로 실행되므로(HTTP 상태와 무관하게 body만 있으면 resolve), heroEvents가 배열인지
      // 확인 없이 그대로 setHeroEvents에 넘기면 undefined가 들어가 이후 heroEvents.slice(...)가
      // 던지며 홈 화면이 통째로 크래시했다(실제 재현: sigungu 쿼리에 콤마가 섞이면 항상 발생).
      .then((data: { heroEvents?: NearbyItem[]; reservationOpenEvents?: NearbyItem[]; currentlyOngoingEvents?: NearbyItem[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.heroEvents)) setHeroEvents(data.heroEvents);
        // "현재 이용 가능"/"예약 가능"은 이제 이 요청이 유일한 데이터 출처라, 배열이 아니어도
        // (에러 응답 등) 빈 배열로 확정해 스켈레톤이 영원히 떠 있지 않게 한다(제5장 제11조).
        setCurrentlyOngoingEvents(Array.isArray(data.currentlyOngoingEvents) ? data.currentlyOngoingEvents : []);
        setReservationOpenEvents(Array.isArray(data.reservationOpenEvents) ? data.reservationOpenEvents : []);
      })
      .catch(() => {
        if (cancelled) return;
        // 재조회 실패 시 heroEvents는 SSR 값을 그대로 유지한다(Fail-Safe). "현재 이용 가능"/
        // "예약 가능"은 아직 한 번도 못 불러왔다면(null) 빈 배열로 확정해 스켈레톤을 걷어낸다
        // (이미 이전에 로드된 값이 있다면 그대로 유지 — 재조회 실패로 기존 데이터를 지우지 않음).
        setCurrentlyOngoingEvents((prev) => prev ?? []);
        setReservationOpenEvents((prev) => prev ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [addressName, sigunguName, center.lat, center.lng]);

  const visibleHeroEvents = heroEvents.slice(0, HERO_VISIBLE_COUNT);
  // Task 9-1-9: 10개 초과 시 "전체 보기" CTA 카드를 마지막 슬라이드에 노출한다.
  // [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시): 더 이상 페이지 이동 링크가 아니라
  // 바텀시트(EventBrowseSheet, mode='today')를 여는 콜백을 HeroCarousel에 넘긴다.
  const heroHasMore = heroEvents.length > HERO_VISIBLE_COUNT;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시) 요구사항 1:
          상단 [홈 / 특가 할인 / 무료 공공] 서브탭 바(HomeSubTabs)를 완전히 제거했다 — 이제
          이 화면 하나가 유일한 메인 화면이라 탭 전환 자체가 무의미해졌다. 그 아래 있던
          "🏷️ 특가·핫딜"/"🎁 무료·공공" 탭 전용 콘텐츠(deals 그리드, 무료·공공 피드)도
          함께 제거했다 — 탭이 사라져 더 이상 도달할 경로가 없기 때문이다(deals
          테이블/`/api/deals`/무료·공공 피드 API 자체는 그대로 남아 있다, 프런트엔드
          연결만 제거). 사용자 피드백(2026-08-22)이 헤더에 상세 도로명주소가 그대로
          나오면 검색바가 가려질 정도로 좁아진다고 해서, 시/군/구 단위 짧은 이름
          (sigunguName)을 우선 보여주는 부분은 그대로 유지한다. */}
      <HomeHeader
        locationLabel={sigunguName ?? addressName}
        onLocationClick={openOnboarding}
        searchValue={searchKeyword}
        onSearchChange={handleSearchChange}
      />

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-5">
        {/* [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "GNB 헤더 & 검색"): 검색어가
            있으면 나머지 콘텐츠 대신 events 전용 검색 결과를 보여준다(라우팅 이동 없음). */}
        {isSearchActive ? (
          <section aria-label="검색 결과" className="px-4">
            {isSearching || searchResults === null ? (
              <FreeFeedSkeleton label="검색 결과 불러오는 중" />
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {searchResults.map((item) => (
                  <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">&quot;{searchKeyword}&quot;에 해당하는 행사를 찾을 수 없습니다.</p>
            )}
          </section>
        ) : (
          <>
            {/* [홈 화면 대분류 그리드 최상단 배치](2026-09-03 사용자 지시): "자연/캠핑,
                공공 키즈카페 등 대분류가 맨 아래에 있다 — 오늘 마감/오늘 한정 뱃지가
                뜨는 행사 카드 영역(오늘의 추천 행사)보다 위로 올려달라"는 지적에 따라
                이 섹션(원래는 "예약 가능" 아래, 여러 시한성 이벤트 슬라이더보다 한참
                뒤에 있었다)을 화면의 첫 콘텐츠 섹션으로 옮긴다. 검색 활성화 시에는
                기존과 동일하게 이 화면 전체가 숨겨지므로(위 isSearchActive 분기) 이
                섹션만 별도로 검색 중 노출할 필요는 없다. */}
            <section aria-label="카테고리별 행사">
              <MajorCategoryGrid
                selectedMaj={selectedMaj}
                onSelectMaj={handleSelectMaj}
                selectedMin={selectedCategory}
                onSelectMin={selectCategory}
                categoryCounts={categoryCounts}
              />
              {selectedCategory !== null && (
                <div className="px-4 mt-3">
                  {isCategoryFeedLoading || categoryFeedItems === null ? (
                    <FreeFeedSkeleton />
                  ) : categoryFeedItems.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {categoryFeedItems.map((item) => (
                          <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                        ))}
                      </div>
                      {/* [중분류 데이터 로딩 속도 개선 - 페이지네이션 도입](2026-09-04
                          사용자 지시): 처음부터 전부 불러오지 않고, 더 볼 사람만 눌러서
                          다음 페이지를 이어붙인다("적절한 단위의 끊어읽기"). */}
                      {categoryFeedHasMore && (
                        <div className="mt-3 flex justify-center">
                          <button
                            type="button"
                            onClick={loadMoreCategoryFeed}
                            disabled={isCategoryFeedLoadingMore}
                            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            {isCategoryFeedLoadingMore ? '불러오는 중...' : '더보기'}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">조건에 맞는 행사를 찾는 중입니다.</p>
                  )}
                </div>
              )}
            </section>

            {/* Task 9-6-10(2026-08-23): 하단 탭 재편으로 이 화면("이벤트픽")은 항상 events만
                보여준다 — 이전의 EVENTS/SPACES 대분류 토글 섹션은 제거했다(상시 공간은
                "스팟픽"(/nearby) 탭이 전담).
                Task 9-6-9(2026-08-23): getTodayEvents가 "당일 한정"(end_date=오늘)으로만 좁혀져
                0건인 날도 흔해졌다 — 빈 상태 안내 문구 대신 섹션 자체를 아예 숨긴다(가변
                노출: N건이면 N개 그대로, 0건이면 비노출, 10개로 억지로 채우지 않음). */}
            {heroEvents.length > 0 && (
              <section aria-label="오늘의 추천 행사">
                <HeroCarousel
                  items={visibleHeroEvents}
                  onSelect={setSelectedItem}
                  hasMore={heroHasMore}
                  onMoreClick={() => setBrowseSheetMode('today')}
                />
              </section>
            )}

            {/* [이벤트픽 화면 개편](2026-08-27 사용자 지시): "예약 가능" 섹션 위에 "현재
                이용 가능"(오늘이 start_date~end_date 진행 기간 안에 있는 행사, 예약 여부와
                무관) 섹션을 추가한다. 0건이면 섹션 자체를 숨긴다(다른 섹션과 동일한 가변
                노출 원칙). ReservationOpenSlider는 단순 가로 스크롤 카드 목록 컴포넌트라
                items만 바꿔 그대로 재사용한다(제5장 제4조 기존 구조 우선).
                [전체보기 페이지](2026-08-27 후속 지시): 미리보기가 최대 20건만 보여주고
                끝나는 게 이상하다는 지적 — Hero Carousel의 "오늘 전체보기"와 동일하게
                전용 페이지(/events/ongoing)로 가는 링크를 추가한다. */}
            {/* [홈 화면 성능 최적화](2026-08-29 사용자 지시): 이 섹션의 데이터는 더 이상
                SSR로 미리 오지 않는다 — null(로드 전)이면 스켈레톤을, 로드 후 0건이면
                섹션 자체를 숨기고(가변 노출 원칙 유지), 1건 이상이면 실제 슬라이더를 보여준다. */}
            {(currentlyOngoingEvents === null || currentlyOngoingEvents.length > 0) && (
              <section aria-label="현재 이용 가능">
                <div className="flex items-center justify-between mb-3 px-4">
                  <h2 className="text-base font-bold text-gray-900">✅ 현재 이용 가능</h2>
                  {currentlyOngoingEvents !== null && (
                    <button
                      type="button"
                      onClick={() => setBrowseSheetMode('ongoing')}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                    >
                      전체보기 →
                    </button>
                  )}
                </div>
                {currentlyOngoingEvents === null ? (
                  <ReservationOpenSliderSkeleton label="현재 이용 가능 불러오는 중" />
                ) : (
                  <ReservationOpenSlider items={currentlyOngoingEvents} onSelect={setSelectedItem} />
                )}
              </section>
            )}

            {/* [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시) 요구사항
                2/3/4: "현재 이용 가능" 바로 아래, "예약 가능" 바로 위에 배치하는 에디터
                추천 제휴 상품 큐레이션 — 세로 공간을 아끼기 위해 그리드가 아니라 가로
                스크롤 슬라이드로 구현한다(BestPickSlider). 광고 느낌을 지우기 위해 할인율
                뱃지 등은 넣지 않고 담백한 타이틀/서브 텍스트만 둔다. 다른 섹션과 동일한
                가변 노출 원칙 — 로드 전(null)이면 스켈레톤, 로드 후 0건이면 섹션 자체를
                숨긴다. */}
            {(bestPicks === null || bestPicks.length > 0) && (
              <section aria-label="베스트 나들이 픽">
                <div className="px-4 mb-3">
                  <h2 className="text-base font-bold text-gray-900">이번 주말 실패 없는 베스트 나들이 픽</h2>
                  <p className="text-xs text-gray-400 mt-0.5">에디터가 직접 검증한 나들이 코스만 엄선했어요.</p>
                </div>
                {bestPicks === null ? (
                  <BestPickSliderSkeleton />
                ) : (
                  <BestPickSlider items={bestPicks} />
                )}
              </section>
            )}

            {/* [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "당일 예약 필요 카드
                구역")/[이벤트픽 화면 개편](2026-08-27 사용자 지시로 "예약 가능"으로 개칭):
                접수중인 이벤트가 없으면 섹션 자체를 숨긴다(Hero와 동일한 가변 노출 원칙).
                [전체보기 페이지](2026-08-27 후속 지시): /events/reservation-open로 가는
                전체보기 링크 추가. */}
            {(reservationOpenEvents === null || reservationOpenEvents.length > 0) && (
              <section aria-label="예약 가능">
                <div className="flex items-center justify-between mb-3 px-4">
                  <h2 className="text-base font-bold text-gray-900">📋 예약 가능</h2>
                  {reservationOpenEvents !== null && (
                    <button
                      type="button"
                      onClick={() => setBrowseSheetMode('reservation-open')}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                    >
                      전체보기 →
                    </button>
                  )}
                </div>
                {reservationOpenEvents === null ? (
                  <ReservationOpenSliderSkeleton label="예약 가능 불러오는 중" />
                ) : (
                  <ReservationOpenSlider items={reservationOpenEvents} onSelect={setSelectedItem} />
                )}
              </section>
            )}

            {/* Task 9-5-1(2026-08-22)/9-6-10(2026-08-23): 이벤트 목적별 5개 하위 테마 칩 — 기본
                선택 테마가 없어(임의로 하나를 고를 근거가 없음) 칩을 직접 누를 때만 지연
                페칭한다. */}
            {/* [UI/UX 개선 및 기능 수정](2026-09-01 사용자 지시) 항목 2: "테마별 행사 영역"
                숨김 처리 — 지시서가 "제거 또는 주석 처리/hidden 적용" 중 hidden을 명시적
                선택지로 제시했고, 이 편이 관련 state(selectedTheme/themeSpotItems)와
                조회 로직을 그대로 둔 채 되돌리기 쉬워 hidden 속성으로 처리한다(삭제 아님).
                섹션 진입 자체가 막히므로 내부 지연 페칭도 함께 걸리지 않는다. */}
            <section aria-label="테마별 추천" className="px-4" hidden>
              <h2 className="text-base font-bold text-gray-900 mb-3">🎪 테마별 행사</h2>
              <div className="flex gap-1.5 overflow-x-auto pb-2">
                {themeOptionsFor('EVENTS').map((theme) => {
                  const isActive = selectedTheme === theme.key;
                  return (
                    <button
                      key={theme.key}
                      type="button"
                      onClick={() => selectTheme(theme.key)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {theme.emoji} {theme.label}
                    </button>
                  );
                })}
              </div>
              {selectedTheme === null ? (
                <p className="text-sm text-gray-400 mt-3">테마를 선택하면 관련 스팟을 보여드려요.</p>
              ) : isThemeSpotLoading || themeSpotItems === null ? (
                <FreeFeedSkeleton />
              ) : themeSpotItems.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                  {themeSpotItems.map((item) => (
                    <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mt-3">조건에 맞는 스팟을 찾는 중입니다.</p>
              )}
            </section>
          </>
        )}
      </div>

      {browseSheetMode && (
        <EventBrowseSheet
          mode={browseSheetMode}
          onClose={() => setBrowseSheetMode(null)}
          onSelectItem={(item) => {
            setBrowseSheetMode(null);
            setSelectedItem(item);
          }}
        />
      )}
      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
      {isOnboardingOpen && (
        <LocationOnboardingModal onConfirm={confirmLocation} onClose={closeOnboarding} />
      )}

      {/* [UI/UX 개선 및 기능 수정](2026-09-01 사용자 지시) 항목 1: 이 화면(`/`, 하단 탭
          "이벤트픽")이 실제 "이벤트픽"이다 — 직전 챗봇 작업에서 "이벤트픽"을 `/calendar`
          (하단 탭이 아니라 "도감/캘린더" 상단 서브탭으로 진입하는 별개 화면)로 잘못
          판단해 그쪽에 FAB를 마운트했던 것을 여기로 정정한다(bottom-tabs.tsx 실측 확인:
          `{ href: '/', label: '이벤트픽' }`). */}
      <AiChatFab center={center} />
    </div>
  );
}
