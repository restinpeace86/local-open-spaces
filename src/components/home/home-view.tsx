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

export function HomeView({ initialFeed }: { initialFeed: HomeFeed }) {
  const { center, addressName, isOnboardingOpen, confirmLocation, openOnboarding, closeOnboarding } =
    useUserLocation();
  const [activeTab, setActiveTab] = useState<HomeSubTab>('home');
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [feed, setFeed] = useState<HomeFeed>(initialFeed);

  // Task 9-1-1: Server Component는 기본값(성남시 분당구)으로만 렌더링할 수 있으므로,
  // 유저가 실제로 위치를 설정한 경우(addressName이 채워짐)에만 그 좌표로 재조회한다.
  // 위치 미설정 상태(온보딩 대기 중, addressName === null)에서는 기본값 렌더링을 그대로 둔다.
  useEffect(() => {
    if (!addressName) return;

    let cancelled = false;
    fetch(`/api/home/feed?lat=${center.lat}&lng=${center.lng}`)
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
  }, [addressName, center.lat, center.lng]);

  const { heroEvents, freeFeed } = feed;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <HomeHeader addressName={addressName} onLocationClick={openOnboarding} />
      <HomeSubTabs active={activeTab} onChange={setActiveTab} />

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-5">
        {activeTab === 'home' && (
          <>
            <section aria-label="오늘의 추천 행사">
              {heroEvents.length > 0 ? (
                <HeroCarousel items={heroEvents} onSelect={setSelectedItem} />
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
