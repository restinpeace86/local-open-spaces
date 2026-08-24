'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { useUserLocation } from '@/hooks/use-user-location';
import { useInView } from '@/hooks/use-in-view';
import { HomeHeader } from '@/components/home/home-header';
import { HomeSubTabs, HomeSubTab } from '@/components/home/home-sub-tabs';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { QuickCategoryGrid } from '@/components/home/quick-category-grid';
import { FreeFeedSkeleton } from '@/components/home/free-feed-skeleton';
import { ThemeSpotKey } from '@/lib/theme-spots';
import { themeOptionsFor } from '@/lib/home-categories';
import { SpaceGridCard } from '@/components/region/space-grid-card';
import { EventCard } from '@/components/cards/event-card';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
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

// Task 9-1-11(2026-08-22): "0원의 행복" → "가성비 행복" 서브탭 개편.
// freeFeed(is_free:true로 이미 걸러진 데이터)를 실제 존재하는 필드로 다시 세분화한다 — 가격
// 등급(price tier) 데이터가 없어 "가성비"의 유일한 데이터 근거는 여전히 is_free이므로
// "완전무료"와 "전체"는 현재로선 같은 결과를 보여준다(추측으로 임의 등급을 만들지 않음).
type FreeFeedFilterKey = 'COMPLETELY_FREE' | 'TODAY_ENTRY' | 'KIDS_SPECIAL' | 'ALL';
const FREE_FEED_FILTERS: { key: FreeFeedFilterKey; label: string }[] = [
  { key: 'COMPLETELY_FREE', label: '🎁 완전무료' },
  { key: 'TODAY_ENTRY', label: '⚡ 당일 바로입장' },
  { key: 'KIDS_SPECIAL', label: '👶 키즈특화' },
  { key: 'ALL', label: '🎟️ 전체' },
];

// SPACE(상시 개방 공간)는 예약/기간 개념이 없어 항상 "바로입장" 가능으로 취급하고,
// EVENT는 오늘이 진행 기간(start_date~end_date)에 포함될 때만 통과시킨다.
function isTodayEntryPossible(item: NearbyItem, todayStr: string): boolean {
  if (item.item_type === 'SPACE') return true;
  return !!item.start_date && !!item.end_date && item.start_date <= todayStr && todayStr <= item.end_date;
}

const FREE_FEED_PREDICATES: Record<FreeFeedFilterKey, (item: NearbyItem, todayStr: string) => boolean> = {
  COMPLETELY_FREE: (item) => item.is_free === true,
  TODAY_ENTRY: (item, todayStr) => isTodayEntryPossible(item, todayStr),
  KIDS_SPECIAL: (item) => item.is_kids_friendly === true,
  ALL: () => true,
};

// Task 9-3-1(2026-08-22): "가성비 행복" 하단 피드는 더 이상 초기 페칭에 포함되지 않고,
// 화면에 스크롤로 들어오거나 "무료·공공" 탭이 선택될 때 /api/home/free-feed로 지연 페칭한다.
// freeFeed === null은 "아직 로드 전"(Skeleton 노출), 배열이면 로드 완료(빈 배열도 포함)를 뜻한다.
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

// Task 9-6-2(2026-08-23, Decision 009): "🗺️ 경기도권 기타" 섹션 — 위치 정보가 전혀 없는
// (location_precision='UNKNOWN') 행사는 특정 지역과 무관해 region이 바뀌어도 결과가 달라지지
// 않으므로, useFreeFeed와 달리 region을 받지 않고 화면에 처음 들어올 때 한 번만 페칭한다.
function useProvinceWideEvents() {
  const [items, setItems] = useState<NearbyItem[] | null>(null);
  const loadedRef = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    fetch('/api/home/province-feed')
      .then((res) => res.json())
      .then((data: { provinceWideEvents?: NearbyItem[] }) => {
        if (Array.isArray(data.provinceWideEvents)) setItems(data.provinceWideEvents);
        else loadedRef.current = false;
      })
      .catch(() => {
        loadedRef.current = false;
      });
  }, []);

  return { items, ensureLoaded };
}

// Task 9-5-1(2026-08-22): "🏞️ 목적별 추천 스팟" 칩 — 가성비 행복과 달리 기본으로 선택된 테마가
// 없어(6개 중 임의로 하나를 고를 근거가 없음) 스크롤 진입이 아니라 칩을 직접 눌렀을 때만
// /api/home/theme-feed를 호출한다. 테마를 바꿔 누르면 그 즉시 새로 페칭한다.
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

export function HomeView({ initialHeroEvents }: { initialHeroEvents: NearbyItem[] }) {
  const { center, addressName, sigunguName, isOnboardingOpen, confirmLocation, openOnboarding, closeOnboarding } =
    useUserLocation();
  const [activeTab, setActiveTab] = useState<HomeSubTab>('home');
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [heroEvents, setHeroEvents] = useState<NearbyItem[]>(initialHeroEvents);
  const [freeFeedFilter, setFreeFeedFilter] = useState<FreeFeedFilterKey>('ALL');
  // Task 9-6-10(2026-08-23): 하단 탭 재편으로 이 화면이 "이벤트픽"(시한성 이벤트 전용)이
  // 됐다 — 상시 공간(open_spaces)은 이제 "스팟픽"(/nearby) 탭이 전담하므로, 이 화면에서는
  // 더 이상 대분류 토글 없이 항상 events만 조회한다(Task 9-6-4에서 도입한 EVENTS/SPACES
  // 토글을 제거 — home-categories.ts의 SPACES 관련 export는 /region 화면이 아직 쓰므로
  // 그대로 둔다, 이 화면의 사용만 정리).
  const dataType = 'events' as const;

  const region = { sigunguName, lat: addressName ? center.lat : undefined, lng: addressName ? center.lng : undefined };
  // 순서 주의: home-view.test.tsx의 FakeIntersectionObserver.instances.at(-1) 관례(가장 최근
  // 생성된 옵저버 = 화면상 가장 마지막(아래) 섹션)를 유지하기 위해, "경기도권 기타"(가성비 행복보다
  // 아래 섹션)의 useInView를 먼저 선언해 인스턴스 배열에서 가성비 행복보다 앞에 오도록 한다.
  const { items: provinceWideEvents, ensureLoaded: ensureProvinceWideLoaded } = useProvinceWideEvents();
  const { ref: provinceWideSectionRef, isInView: isProvinceWideSectionInView } = useInView<HTMLDivElement>();
  const { freeFeed, ensureLoaded } = useFreeFeed(region, dataType);
  const { ref: freeFeedSectionRef, isInView: isFreeFeedSectionInView } = useInView<HTMLDivElement>();
  const {
    selectedTheme,
    items: themeSpotItems,
    isLoading: isThemeSpotLoading,
    selectTheme,
  } = useThemeSpotFeed(region, dataType);

  // Task 9-1-1: Server Component는 기본 지역(성남시 분당구)으로만 렌더링할 수 있으므로,
  // 유저가 실제로 위치를 설정한 경우(addressName이 채워짐)에만 그 지역으로 재조회한다.
  // 위치 미설정 상태(온보딩 대기 중, addressName === null)에서는 기본값 렌더링을 그대로 둔다.
  // Task 9-1-3: 위치 온보딩 확정 시 한 번만 계산해 저장해 둔 sigunguName을 그대로 넘긴다 —
  // 피드를 불러올 때마다(요청마다) 주소 문자열을 다시 파싱하지 않는다.
  // 사용자 피드백(2026-08-22): 위치가 설정/재설정되면(addressName 변경) 실제 좌표(center)도
  // 함께 넘겨, 서버가 이미 걸러둔 후보군 안에서 가까운 순서로 재정렬하도록 한다.
  // Task 9-3-1: 재조회 대상은 Hero뿐이다 — 가성비 행복 피드는 useFreeFeed가 region 변경을
  // 직접 감지해(정확히는 아래 effect가 이미 로드됐거나 화면에 보이는 경우에만) 별도로 다시 페칭한다.
  useEffect(() => {
    if (!addressName) return;

    let cancelled = false;
    fetch(`/api/home/feed?sigungu=${encodeURIComponent(sigunguName ?? '')}&lat=${center.lat}&lng=${center.lng}`)
      .then((res) => res.json())
      // 긴급 수리(2026-08-22) 실측 재현: API가 500과 함께 { error: "..." }를 반환해도 이 then은
      // 그대로 실행되므로(HTTP 상태와 무관하게 body만 있으면 resolve), heroEvents가 배열인지
      // 확인 없이 그대로 setHeroEvents에 넘기면 undefined가 들어가 이후 heroEvents.slice(...)가
      // 던지며 홈 화면이 통째로 크래시했다(실제 재현: sigungu 쿼리에 콤마가 섞이면 항상 발생).
      .then((data: { heroEvents?: NearbyItem[] }) => {
        if (!cancelled && Array.isArray(data.heroEvents)) setHeroEvents(data.heroEvents);
        // 배열이 아니면(에러 응답 등) 기존 피드를 그대로 유지한다(Fail-Safe).
      })
      .catch(() => {
        // 재조회 실패 시 기존 피드를 그대로 유지한다(Fail-Safe — 화면이 깨지지 않게).
      });

    return () => {
      cancelled = true;
    };
  }, [addressName, sigunguName, center.lat, center.lng]);

  // "가성비 행복" 섹션이 화면에 들어왔거나(스크롤) "무료·공공" 탭이 선택되면 로드를 시작한다.
  // region이 바뀐 뒤에도 이미 보이는/선택된 상태라면 ensureLoaded가 새 region으로 다시 페칭한다.
  useEffect(() => {
    if (isFreeFeedSectionInView || activeTab === 'free') ensureLoaded();
  }, [isFreeFeedSectionInView, activeTab, ensureLoaded]);

  // Task 9-6-2: "경기도권 기타" 섹션이 화면에 들어오면 지연 페칭한다(가성비 행복과 동일한 패턴).
  useEffect(() => {
    if (isProvinceWideSectionInView) ensureProvinceWideLoaded();
  }, [isProvinceWideSectionInView, ensureProvinceWideLoaded]);

  const visibleHeroEvents = heroEvents.slice(0, HERO_VISIBLE_COUNT);
  // Task 9-1-9: 10개 초과 시 "전체 보기" CTA 카드를 마지막 슬라이드에 노출한다.
  // Task 9-6-6(2026-08-23): 지도(/nearby)도, 상시 공간 카탈로그 화면(/region)도 아니라 오늘
  // 진행 중인 행사만 모아 보여주는 전용 카드 그리드 페이지(/events/today)로 이동한다 —
  // 거리(GPS) 기반 정렬 없이 행정구역 계층(구/시 → 도, 타 지자체 완전 차단)으로만 피딩된다.
  const heroMoreHref = heroEvents.length > HERO_VISIBLE_COUNT ? '/events/today' : undefined;

  // Task 9-1-11: "가성비 행복" 서브탭 선택에 따라 freeFeed를 다시 걸러낸다.
  const todayStr = new Date().toISOString().slice(0, 10);
  const filteredFreeFeed = (freeFeed ?? []).filter((item) => FREE_FEED_PREDICATES[freeFeedFilter](item, todayStr));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 사용자 피드백(2026-08-22): 헤더에 상세 도로명주소가 그대로 나오면 검색바가 가려질
          정도로 좁아진다 — 시/군/구 단위 짧은 이름(sigunguName)을 우선 보여준다. */}
      <HomeHeader locationLabel={sigunguName ?? addressName} onLocationClick={openOnboarding} />
      <HomeSubTabs active={activeTab} onChange={setActiveTab} />

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-5">
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
                <HeroCarousel items={visibleHeroEvents} onSelect={setSelectedItem} moreHref={heroMoreHref} />
              </section>
            )}

            <QuickCategoryGrid />

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

            {/* Task 9-3-1: 이 섹션이 화면에 처음 들어올 때 useInView가 감지해 가성비 행복
                피드를 지연 페칭한다 — 그 전/로딩 중에는 Skeleton UI로 레이아웃을 미리 확보한다. */}
            <section aria-label="가성비 행복" className="px-4" ref={freeFeedSectionRef}>
              <h2 className="text-base font-bold text-gray-900 mb-3">💰 가성비 행복</h2>
              <div className="flex gap-1.5 overflow-x-auto pb-2">
                {FREE_FEED_FILTERS.map((f) => {
                  const isActive = freeFeedFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFreeFeedFilter(f.key)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              {freeFeed === null ? (
                <FreeFeedSkeleton />
              ) : filteredFreeFeed.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                  {filteredFreeFeed.map((item) => (
                    <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mt-3">조건에 맞는 공간/행사를 찾는 중입니다.</p>
              )}
            </section>

            {/* Task 9-6-2(2026-08-23, Decision 009): 위치 정보가 전혀 없는(location_precision=
                'UNKNOWN') 경기도권 행사 — 지도/주변에는 노출되지 않고 메인 페이지에서만 볼 수 있다.
                events 전용 콘텐츠다(Task 9-6-10: 이 화면 자체가 이제 항상 events만 다룸). 항목이
                없으면 섹션 자체를 숨긴다(다른 섹션과 달리 "찾는 중" 안내를 굳이 보여줄 핵심
                콘텐츠가 아님). */}
            {provinceWideEvents === null || provinceWideEvents.length > 0 ? (
              <section aria-label="경기도권 기타" className="px-4" ref={provinceWideSectionRef}>
                <h2 className="text-base font-bold text-gray-900 mb-3">🗺️ 경기도권 기타</h2>
                {provinceWideEvents === null ? (
                  <FreeFeedSkeleton label="경기도권 기타 피드 불러오는 중" />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                    {provinceWideEvents.map((item) => (
                      <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                    ))}
                  </div>
                )}
              </section>
            ) : null}
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
      </div>

      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
      {isOnboardingOpen && (
        <LocationOnboardingModal onConfirm={confirmLocation} onClose={closeOnboarding} />
      )}
    </div>
  );
}
