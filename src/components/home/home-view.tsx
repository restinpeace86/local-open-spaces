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

// 사용자 피드백(2026-08-22): Hero Carousel은 처음엔 이만큼만 보여주고, 같은 조건(Strict
// Location-First)으로 개수 때문에 잘린 나머지는 "+더보기"로 펼쳐서 보여준다.
const HERO_VISIBLE_COUNT = 10;

export function HomeView({ initialFeed }: { initialFeed: HomeFeed }) {
  const { center, addressName, sigunguName, isOnboardingOpen, confirmLocation, openOnboarding, closeOnboarding } =
    useUserLocation();
  const [activeTab, setActiveTab] = useState<HomeSubTab>('home');
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [feed, setFeed] = useState<HomeFeed>(initialFeed);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);

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
        if (!cancelled) {
          setFeed(data);
          setIsHeroExpanded(false);
        }
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
  const extraHeroEvents = heroEvents.slice(HERO_VISIBLE_COUNT);

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
                <>
                  <HeroCarousel items={visibleHeroEvents} onSelect={setSelectedItem} />
                  {/* 사용자 피드백(2026-08-22): 메인 카드와 같은 조건(Strict Location-First)인데
                      개수 제한 때문에 잘린 항목을 바로 아래 "+더보기"로 이어서 볼 수 있게 한다. */}
                  {extraHeroEvents.length > 0 && (
                    <div className="px-4 mt-3">
                      <button
                        type="button"
                        onClick={() => setIsHeroExpanded((v) => !v)}
                        className="w-full rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                      >
                        {isHeroExpanded ? '접기' : `+ 더보기 (${extraHeroEvents.length}건)`}
                      </button>
                    </div>
                  )}
                  {isHeroExpanded && extraHeroEvents.length > 0 && (
                    <div className="px-4 mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {extraHeroEvents.map((item) => (
                        <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="px-4 text-sm text-gray-400">오늘 진행 중인 추천 행사가 아직 없습니다.</p>
              )}
            </section>

            <QuickCategoryGrid />

            <section aria-label="0원의 행복" className="px-4">
              <h2 className="text-base font-bold text-gray-900 mb-3">🎁 0원의 행복</h2>
              {freeFeed.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {freeFeed.map((item) => (
                    <FeedCard key={item.id} item={item} onSelect={setSelectedItem} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">완전 무료 공간/행사를 찾는 중입니다.</p>
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
