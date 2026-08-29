'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { useUserLocation } from '@/hooks/use-user-location';
import { HomeHeader } from '@/components/home/home-header';
import { HomeSubTabs, HomeSubTab } from '@/components/home/home-sub-tabs';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { ReservationOpenSlider, ReservationOpenSliderSkeleton } from '@/components/home/reservation-open-slider';
import { EventBrowseSheet, EventBrowseSheetMode } from '@/components/home/event-browse-sheet';
import { MajorCategoryGrid } from '@/components/home/major-category-grid';
import { FreeFeedSkeleton } from '@/components/home/free-feed-skeleton';
import { ThemeSpotKey } from '@/lib/theme-spots';
import { themeOptionsFor } from '@/lib/home-categories';
import { SpaceGridCard } from '@/components/region/space-grid-card';
import { EventCard } from '@/components/cards/event-card';
import { DealCard, Deal } from '@/components/cards/deal-card';
import { EventTicketCard, EventTicket } from '@/components/cards/event-ticket-card';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { DealDetailModal } from '@/components/map/deal-detail-modal';
import { EventTicketDetailModal } from '@/components/map/event-ticket-detail-modal';
import { LocationOnboardingModal } from '@/components/map/location-onboarding-modal';

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

// Task 9-3-1(2026-08-22)/9-6-18(2026-08-25, docs/spec.md 3.2 "화면 구성 및 UI 간소화"): 메인
// 홈의 "가성비 행복" 필터 섹션은 완전히 제거됐다(해당 정보는 5대 카테고리 및 카드 뱃지로 통합
// 노출). 이 훅은 이제 "🎁 무료·공공" 서브탭 전용으로만 쓰인다 — 탭이 선택될 때 /api/home/free-feed로
// 지연 페칭한다. freeFeed === null은 "아직 로드 전"(Skeleton 노출), 배열이면 로드 완료(빈 배열도 포함)를 뜻한다.
// region(sigunguName/lat/lng)이 바뀌면(위치 재설정) 이미 로드된 상태라도 새 지역으로 다시
// 페칭하도록, 마지막으로 로드를 시작한 region 키를 기억해뒀다가 달라지면 재요청한다.
// Task 9-6-4(2026-08-23): 최상위 대분류(🎪 행사·축제/🏞️ 상시 장소)에 따라 dataType이 바뀌므로
// regionKey에 포함해, 카테고리를 전환하면 이미 로드된 상태라도 다시 페칭하도록 한다.
function useFreeFeed(region: { sigunguName: string | null; lat?: number; lng?: number }, dataType: 'events' | 'open_spaces') {
  const [freeFeed, setFreeFeed] = useState<NearbyItem[] | null>(null);
  const regionKey = `${region.sigunguName ?? ''}|${region.lat ?? ''}|${region.lng ?? ''}|${dataType}`;
  const loadedKeyRef = useRef<string | null>(null);

  const ensureLoaded = useCallback(() => {
    if (loadedKeyRef.current === regionKey) return;
    loadedKeyRef.current = regionKey;

    const params = new URLSearchParams({ dataType });
    if (region.sigunguName) params.set('sigungu', region.sigunguName);
    if (typeof region.lat === 'number') params.set('lat', String(region.lat));
    if (typeof region.lng === 'number') params.set('lng', String(region.lng));

    fetch(`/api/home/free-feed?${params.toString()}`)
      .then((res) => res.json())
      // 긴급 수리(2026-08-22): API가 500과 함께 { error: "..." }를 돌려줘도 이 then은 그대로
      // 실행된다(fetch는 HTTP 상태와 무관하게 응답 바디만 있으면 resolve됨) — data.freeFeed가
      // 배열이 아니면(undefined 포함) setFreeFeed에 넘기지 않아야 이후 filter() 호출이 깨지지
      // 않는다(실측 재현: 서버가 에러를 던지면 freeFeed가 undefined가 돼 화면이 통째로 크래시했음).
      .then((data: { freeFeed?: NearbyItem[] }) => {
        if (Array.isArray(data.freeFeed)) setFreeFeed(data.freeFeed);
        else loadedKeyRef.current = null;
      })
      .catch(() => {
        // 실패 시 다음 시도(재스크롤/탭 재선택)에서 다시 요청할 수 있도록 로드 키를 되돌린다.
        loadedKeyRef.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey]);

  return { freeFeed, ensureLoaded };
}

// [제휴 특가 Deals 시스템 및 수집 어댑터 MVP](2026-08-29 사용자 지시): "특가·핫딜" 탭 전용 —
// deals는 위치/지역 개념이 없는 커머스 상품이라(useFreeFeed와 달리 region이 바뀌어도 다시
// 페칭할 이유가 없음) 탭이 처음 선택될 때 딱 한 번만 지연 페칭한다.
function useDealsFeed() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const loadedRef = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    fetch('/api/deals')
      .then((res) => res.json())
      .then((data: { deals?: Deal[] }) => {
        if (Array.isArray(data.deals)) setDeals(data.deals);
        else loadedRef.current = false;
      })
      .catch(() => {
        loadedRef.current = false;
      });
  }, []);

  return { deals, ensureLoaded };
}

// [이벤트픽 & 티켓 할인 정보 MVP](2026-08-29 사용자 지시): "홈" 탭에 상시 노출되는 축제/
// 체험/입장권 할인 카드 그리드 전용 — useDealsFeed와 동일하게 지역 개념이 없어(수동 큐레이션
// 콘텐츠) 처음 'home' 탭이 보일 때 한 번만 페칭한다.
function useEventTicketsFeed() {
  const [eventTickets, setEventTickets] = useState<EventTicket[] | null>(null);
  const loadedRef = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    fetch('/api/event-tickets')
      .then((res) => res.json())
      .then((data: { eventTickets?: EventTicket[] }) => {
        if (Array.isArray(data.eventTickets)) setEventTickets(data.eventTickets);
        else loadedRef.current = false;
      })
      .catch(() => {
        loadedRef.current = false;
      });
  }, []);

  return { eventTickets, ensureLoaded };
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
function useCategoryFeed(region: { sigunguName: string | null; lat?: number; lng?: number }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [items, setItems] = useState<NearbyItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectCategory = useCallback(
    (category: string) => {
      setSelectedCategory(category);
      setItems(null);
      setIsLoading(true);

      const params = new URLSearchParams({ category });
      if (region.sigunguName) params.set('sigungu', region.sigunguName);
      if (typeof region.lat === 'number') params.set('lat', String(region.lat));
      if (typeof region.lng === 'number') params.set('lng', String(region.lng));

      fetch(`/api/home/category-feed?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { items?: NearbyItem[] }) => setItems(Array.isArray(data.items) ? data.items : []))
        .catch(() => setItems([]))
        .finally(() => setIsLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region.sigunguName, region.lat, region.lng]
  );

  const reset = useCallback(() => {
    setSelectedCategory(null);
    setItems(null);
  }, []);

  return { selectedCategory, items, isLoading, selectCategory, reset };
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
  const [activeTab, setActiveTab] = useState<HomeSubTab>('home');
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedEventTicket, setSelectedEventTicket] = useState<EventTicket | null>(null);
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
  // Task 9-6-18: 홈 탭의 "가성비 행복" 섹션이 제거되어 이제 "🎁 무료·공공" 서브탭 전용이다.
  const { freeFeed, ensureLoaded } = useFreeFeed(region, dataType);
  const { deals, ensureLoaded: ensureDealsLoaded } = useDealsFeed();
  const { eventTickets, ensureLoaded: ensureEventTicketsLoaded } = useEventTicketsFeed();
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
    selectCategory,
    reset: resetCategoryFeed,
  } = useCategoryFeed(region);
  // [대분류·중분류 드릴다운 개편](2026-08-27 사용자 지시): 대분류 선택은 순수 UI 상태라(조회를
  // 트리거하지 않음, 그 아래 중분류 칩 목록을 펼치는 역할만 함) 별도 로컬 state로 둔다. 실제
  // 카드 조회는 여전히 useCategoryFeed의 selectCategory(중분류 값)가 담당한다.
  const [selectedMaj, setSelectedMaj] = useState<string | null>(null);
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

  // "🎁 무료·공공" 탭이 선택되면 로드를 시작한다. region이 바뀐 뒤에도 이미 선택된 상태라면
  // ensureLoaded가 새 region으로 다시 페칭한다.
  useEffect(() => {
    if (activeTab === 'free') ensureLoaded();
  }, [activeTab, ensureLoaded]);

  // "🏷️ 특가·핫딜" 탭이 선택되면 로드를 시작한다(위와 동일한 지연 페칭 패턴).
  useEffect(() => {
    if (activeTab === 'hotdeal') ensureDealsLoaded();
  }, [activeTab, ensureDealsLoaded]);

  // [이벤트픽 & 티켓 할인 정보 MVP](2026-08-29 사용자 지시): "홈" 탭에 상시 노출되는
  // 섹션이라 'hotdeal'/'free'와 달리 'home' 탭에서 로드를 시작한다(기본 탭이라 사실상
  // 마운트 직후 한 번 페칭됨).
  useEffect(() => {
    if (activeTab === 'home') ensureEventTicketsLoaded();
  }, [activeTab, ensureEventTicketsLoaded]);

  const visibleHeroEvents = heroEvents.slice(0, HERO_VISIBLE_COUNT);
  // Task 9-1-9: 10개 초과 시 "전체 보기" CTA 카드를 마지막 슬라이드에 노출한다.
  // [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시): 더 이상 페이지 이동 링크가 아니라
  // 바텀시트(EventBrowseSheet, mode='today')를 여는 콜백을 HeroCarousel에 넘긴다.
  const heroHasMore = heroEvents.length > HERO_VISIBLE_COUNT;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 사용자 피드백(2026-08-22): 헤더에 상세 도로명주소가 그대로 나오면 검색바가 가려질
          정도로 좁아진다 — 시/군/구 단위 짧은 이름(sigunguName)을 우선 보여준다. */}
      <HomeHeader
        locationLabel={sigunguName ?? addressName}
        onLocationClick={openOnboarding}
        searchValue={searchKeyword}
        onSearchChange={handleSearchChange}
      />
      <HomeSubTabs active={activeTab} onChange={setActiveTab} />

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-5">
        {/* [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "GNB 헤더 & 검색"): 검색어가
            있으면 서브탭 콘텐츠 대신 events 전용 검색 결과를 보여준다(라우팅 이동 없음). */}
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
        {activeTab === 'home' && (
          <>
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

            {/* [이벤트픽 & 티켓 할인 정보 MVP](2026-08-29 사용자 지시): 지역 축제/체험
                프로그램/입장권 할인 정보를 그리드로 보여주는 상시 섹션. 다른 섹션과 동일한
                가변 노출 원칙 — 로드 전(null)이면 스켈레톤, 로드 후 0건이면 섹션 자체를
                숨긴다. */}
            {(eventTickets === null || eventTickets.length > 0) && (
              <section aria-label="이벤트·티켓 할인">
                <h2 className="text-base font-bold text-gray-900 mb-3 px-4">🎫 할인 티켓·이벤트</h2>
                {eventTickets === null ? (
                  <div className="px-4">
                    <FreeFeedSkeleton label="할인 티켓·이벤트 불러오는 중" />
                  </div>
                ) : (
                  <div className="px-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {eventTickets.map((eventTicket) => (
                      <EventTicketCard
                        key={eventTicket.id}
                        eventTicket={eventTicket}
                        onSelect={setSelectedEventTicket}
                      />
                    ))}
                  </div>
                )}
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

            {/* Task 9-6-17(2026-08-25, docs/spec.md 2.2 ② 개정)/[대분류·중분류 드릴다운
                개편](2026-08-27 사용자 지시): 대분류를 누르면 중분류 칩이 펼쳐지고, 중분류를
                누르면 라우팅 없이 이 화면 내부에서 바로 아래 카드 피드가 전환된다(인라인 피딩). */}
            <section aria-label="카테고리별 행사">
              <MajorCategoryGrid
                selectedMaj={selectedMaj}
                onSelectMaj={handleSelectMaj}
                selectedMin={selectedCategory}
                onSelectMin={selectCategory}
              />
              {selectedCategory !== null && (
                <div className="px-4 mt-3">
                  {isCategoryFeedLoading || categoryFeedItems === null ? (
                    <FreeFeedSkeleton />
                  ) : categoryFeedItems.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {categoryFeedItems.map((item) => (
                        <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">조건에 맞는 행사를 찾는 중입니다.</p>
                  )}
                </div>
              )}
            </section>

            {/* Task 9-5-1(2026-08-22)/9-6-10(2026-08-23): 이벤트 목적별 5개 하위 테마 칩 — 기본
                선택 테마가 없어(임의로 하나를 고를 근거가 없음) 칩을 직접 누를 때만 지연
                페칭한다. */}
            <section aria-label="테마별 추천" className="px-4">
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

        {activeTab === 'free' && (
          <section aria-label="무료·공공" className="px-4">
            {freeFeed === null ? (
              <FreeFeedSkeleton />
            ) : freeFeed.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {freeFeed.map((item) => (
                  <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                ))}
              </div>
            ) : (
              <EmptyState onReset={() => setActiveTab('home')} />
            )}
          </section>
        )}

        {activeTab === 'hotdeal' && (
          <section aria-label="특가·핫딜" className="px-4">
            {deals === null ? (
              <FreeFeedSkeleton label="특가·핫딜 불러오는 중" />
            ) : deals.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} onSelect={setSelectedDeal} />
                ))}
              </div>
            ) : (
              <EmptyState onReset={() => setActiveTab('home')} />
            )}
          </section>
        )}
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
      {selectedDeal && <DealDetailModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />}
      {selectedEventTicket && (
        <EventTicketDetailModal eventTicket={selectedEventTicket} onClose={() => setSelectedEventTicket(null)} />
      )}
      {isOnboardingOpen && (
        <LocationOnboardingModal onConfirm={confirmLocation} onClose={closeOnboarding} />
      )}
    </div>
  );
}
