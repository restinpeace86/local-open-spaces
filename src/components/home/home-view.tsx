'use client';

import { useEffect, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { useUserLocation } from '@/hooks/use-user-location';
import { HomeHeader } from '@/components/home/home-header';
import { HomeSubTabs, HomeSubTab } from '@/components/home/home-sub-tabs';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { QuickCategoryGrid } from '@/components/home/quick-category-grid';
import { SpaceGridCard } from '@/components/region/space-grid-card';
import { EventCard } from '@/components/cards/event-card';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { LocationOnboardingModal } from '@/components/map/location-onboarding-modal';
import { HomeFeed } from '@/lib/home/get-home-feed';

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

export function HomeView({ initialFeed }: { initialFeed: HomeFeed }) {
  const { center, addressName, sigunguName, isOnboardingOpen, confirmLocation, openOnboarding, closeOnboarding } =
    useUserLocation();
  const [activeTab, setActiveTab] = useState<HomeSubTab>('home');
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [feed, setFeed] = useState<HomeFeed>(initialFeed);
  const [freeFeedFilter, setFreeFeedFilter] = useState<FreeFeedFilterKey>('ALL');

  // Task 9-1-1: Server Component는 기본 지역(성남시 분당구)으로만 렌더링할 수 있으므로,
  // 유저가 실제로 위치를 설정한 경우(addressName이 채워짐)에만 그 지역으로 재조회한다.
  // 위치 미설정 상태(온보딩 대기 중, addressName === null)에서는 기본값 렌더링을 그대로 둔다.
  // Task 9-1-3: 위치 온보딩 확정 시 한 번만 계산해 저장해 둔 sigunguName을 그대로 넘긴다 —
  // 피드를 불러올 때마다(요청마다) 주소 문자열을 다시 파싱하지 않는다.
  // 사용자 피드백(2026-08-22): 위치가 설정/재설정되면(addressName 변경) 실제 좌표(center)도
  // 함께 넘겨, 서버가 이미 걸러둔 후보군 안에서 가까운 순서로 재정렬하도록 한다.
  useEffect(() => {
    if (!addressName) return;

    let cancelled = false;
    fetch(
      `/api/home/feed?sigungu=${encodeURIComponent(sigunguName ?? '')}&lat=${center.lat}&lng=${center.lng}`
    )
      .then((res) => res.json())
      .then((data: HomeFeed) => {
        if (!cancelled) setFeed(data);
      })
      .catch(() => {
        // 재조회 실패 시 기존 피드를 그대로 유지한다(Fail-Safe — 화면이 깨지지 않게).
      });

    return () => {
      cancelled = true;
    };
  }, [addressName, sigunguName, center.lat, center.lng]);

  const { heroEvents, freeFeed } = feed;
  const visibleHeroEvents = heroEvents.slice(0, HERO_VISIBLE_COUNT);
  // Task 9-1-9: 10개 초과 시 지도 화면(오늘/주말 즉시 이용 가능 Quick 필터 활성 상태)으로
  // 연동되는 "전체 보기" CTA 카드를 마지막 슬라이드에 노출한다.
  const heroMoreHref = heroEvents.length > HERO_VISIBLE_COUNT ? '/nearby?filter=TODAY_WEEKEND' : undefined;

  // Task 9-1-11: "가성비 행복" 서브탭 선택에 따라 freeFeed를 다시 걸러낸다.
  const todayStr = new Date().toISOString().slice(0, 10);
  const filteredFreeFeed = freeFeed.filter((item) => FREE_FEED_PREDICATES[freeFeedFilter](item, todayStr));

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

            <section aria-label="가성비 행복" className="px-4">
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
              {filteredFreeFeed.length > 0 ? (
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
            {freeFeed.length > 0 ? (
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
