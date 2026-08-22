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
import { THEME_SPOT_OPTIONS, ThemeSpotKey } from '@/lib/theme-spots';
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
// "전체 보기" CTA 카드(지도 화면 연동)로 대체한다.
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
function useFreeFeed(region: { sigunguName: string | null; lat?: number; lng?: number }) {
  const [freeFeed, setFreeFeed] = useState<NearbyItem[] | null>(null);
  const regionKey = `${region.sigunguName ?? ''}|${region.lat ?? ''}|${region.lng ?? ''}`;
  const loadedKeyRef = useRef<string | null>(null);

  const ensureLoaded = useCallback(() => {
    if (loadedKeyRef.current === regionKey) return;
    loadedKeyRef.current = regionKey;

    const params = new URLSearchParams();
    if (region.sigunguName) params.set('sigungu', region.sigunguName);
    if (typeof region.lat === 'number') params.set('lat', String(region.lat));
    if (typeof region.lng === 'number') params.set('lng', String(region.lng));

    fetch(`/api/home/free-feed?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { freeFeed: NearbyItem[] }) => setFreeFeed(data.freeFeed))
      .catch(() => {
        // 실패 시 다음 시도(재스크롤/탭 재선택)에서 다시 요청할 수 있도록 로드 키를 되돌린다.
        loadedKeyRef.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey]);

  return { freeFeed, ensureLoaded };
}

// Task 9-5-1(2026-08-22): "🏞️ 목적별 추천 스팟" 칩 — 가성비 행복과 달리 기본으로 선택된 테마가
// 없어(6개 중 임의로 하나를 고를 근거가 없음) 스크롤 진입이 아니라 칩을 직접 눌렀을 때만
// /api/home/theme-feed를 호출한다. 테마를 바꿔 누르면 그 즉시 새로 페칭한다.
function useThemeSpotFeed(region: { sigunguName: string | null; lat?: number; lng?: number }) {
  const [selectedTheme, setSelectedTheme] = useState<ThemeSpotKey | null>(null);
  const [items, setItems] = useState<NearbyItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectTheme = useCallback(
    (theme: ThemeSpotKey) => {
      setSelectedTheme(theme);
      setItems(null);
      setIsLoading(true);

      const params = new URLSearchParams({ theme });
      if (region.sigunguName) params.set('sigungu', region.sigunguName);
      if (typeof region.lat === 'number') params.set('lat', String(region.lat));
      if (typeof region.lng === 'number') params.set('lng', String(region.lng));

      fetch(`/api/home/theme-feed?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { items: NearbyItem[] }) => setItems(data.items ?? []))
        .catch(() => setItems([]))
        .finally(() => setIsLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region.sigunguName, region.lat, region.lng]
  );

  return { selectedTheme, items, isLoading, selectTheme };
}

export function HomeView({ initialHeroEvents }: { initialHeroEvents: NearbyItem[] }) {
  const { center, addressName, sigunguName, isOnboardingOpen, confirmLocation, openOnboarding, closeOnboarding } =
    useUserLocation();
  const [activeTab, setActiveTab] = useState<HomeSubTab>('home');
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [heroEvents, setHeroEvents] = useState<NearbyItem[]>(initialHeroEvents);
  const [freeFeedFilter, setFreeFeedFilter] = useState<FreeFeedFilterKey>('ALL');

  const region = { sigunguName, lat: addressName ? center.lat : undefined, lng: addressName ? center.lng : undefined };
  const { freeFeed, ensureLoaded } = useFreeFeed(region);
  const { ref: freeFeedSectionRef, isInView: isFreeFeedSectionInView } = useInView<HTMLDivElement>();
  const {
    selectedTheme,
    items: themeSpotItems,
    isLoading: isThemeSpotLoading,
    selectTheme,
  } = useThemeSpotFeed(region);

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
      .then((data: { heroEvents: NearbyItem[] }) => {
        if (!cancelled) setHeroEvents(data.heroEvents);
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

  const visibleHeroEvents = heroEvents.slice(0, HERO_VISIBLE_COUNT);
  // Task 9-1-9: 10개 초과 시 지도 화면(오늘/주말 즉시 이용 가능 Quick 필터 활성 상태)으로
  // 연동되는 "전체 보기" CTA 카드를 마지막 슬라이드에 노출한다.
  const heroMoreHref = heroEvents.length > HERO_VISIBLE_COUNT ? '/nearby?filter=TODAY_WEEKEND' : undefined;

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
            <section aria-label="오늘의 추천 행사">
              {heroEvents.length > 0 ? (
                <HeroCarousel items={visibleHeroEvents} onSelect={setSelectedItem} moreHref={heroMoreHref} />
              ) : (
                <p className="px-4 text-sm text-gray-400">오늘 진행 중인 추천 행사가 아직 없습니다.</p>
              )}
            </section>

            <QuickCategoryGrid />

            {/* Task 9-5-1(2026-08-22): 목적/장소별 테마 스팟 그룹화 — 기본 선택 테마가 없어
                (6개 중 임의로 하나를 고를 근거가 없음) 칩을 직접 누를 때만 지연 페칭한다. */}
            <section aria-label="목적별 추천 스팟" className="px-4">
              <h2 className="text-base font-bold text-gray-900 mb-3">🏞️ 목적별 추천 스팟</h2>
              <div className="flex gap-1.5 overflow-x-auto pb-2">
                {THEME_SPOT_OPTIONS.map((theme) => {
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
