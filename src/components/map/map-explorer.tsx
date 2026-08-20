'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KakaoMapView } from '@/components/map/kakao-map-view';
import { RadiusSelector } from '@/components/map/radius-selector';
import { LayerToggle } from '@/components/map/layer-toggle';
import { SearchBar } from '@/components/map/search-bar';
import { CategoryFilter, ALL_CATEGORY } from '@/components/map/category-filter';
import { QuickFilters } from '@/components/map/quick-filters';
import { ItemListPanel } from '@/components/map/item-list-panel';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { Toast } from '@/components/map/toast';
import { GridViewPrompt } from '@/components/map/grid-view-prompt';
import { LocationHeader } from '@/components/map/location-header';
import { LocationOnboardingModal } from '@/components/map/location-onboarding-modal';
import { RecenterButton } from '@/components/map/recenter-button';
import { getNearbySpacesAndEvents, NearbyItem } from '@/lib/spaces/get-nearby';
import { matchesQuickFilters, QuickFilterKey } from '@/lib/spaces/quick-filters';
import { useUserLocation } from '@/hooks/use-user-location';

// spec/map/spatial-search.md 3.1: 반경 내 최대 200개 마커만 우선 렌더링
const MARKER_LIMIT = 200;

export function MapExplorer() {
  const router = useRouter();
  const {
    center,
    addressName,
    isOnboardingOpen,
    confirmLocation,
    openOnboarding,
    closeOnboarding,
  } = useUserLocation();
  const [radius, setRadius] = useState(5000);
  const [showSpaces, setShowSpaces] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [activeQuickFilters, setActiveQuickFilters] = useState<QuickFilterKey[]>([]);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showGridViewPrompt, setShowGridViewPrompt] = useState(false);
  // implementation/todo.md: 지도 드래그로 이동한 위치를 새로운 검색 기준점으로 지정하기 위한 override 상태.
  // '내 위치' 원본 좌표(useUserLocation)는 그대로 유지하고, 재검색 버튼 클릭 시에만 탐색 기준점을 갱신한다.
  const [searchOverrideCenter, setSearchOverrideCenter] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [pendingRecenter, setPendingRecenter] = useState<{ lat: number; lng: number } | null>(null);
  const effectiveCenter = searchOverrideCenter ?? center;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    getNearbySpacesAndEvents(effectiveCenter.lng, effectiveCenter.lat, radius)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMessage(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveCenter.lat, effectiveCenter.lng, radius]);

  // implementation/todo.md: '내 동네' 재설정 시 지도 드래그로 인한 임시 재검색 기준점은 초기화한다.
  const handleConfirmLocation = useCallback(
    (location: Parameters<typeof confirmLocation>[0]) => {
      setSearchOverrideCenter(null);
      setPendingRecenter(null);
      confirmLocation(location);
    },
    [confirmLocation]
  );

  // implementation/todo.md: dragend 발생 시 새로운 지도 중심을 재검색 후보로 저장해 Floating 버튼을 노출한다.
  const handleMapDragEnd = useCallback((dragCenter: { lat: number; lng: number }) => {
    setPendingRecenter(dragCenter);
  }, []);

  // implementation/todo.md: 재검색 버튼 클릭 시 지도 중심을 새로운 탐색 기준점으로 지정하고 버튼을 숨긴다.
  const handleRecenterSearch = useCallback(() => {
    if (!pendingRecenter) return;
    setSearchOverrideCenter(pendingRecenter);
    setPendingRecenter(null);
  }, [pendingRecenter]);

  const resetFilters = useCallback(() => {
    setKeyword('');
    setCategory(ALL_CATEGORY);
    setActiveQuickFilters([]);
  }, []);

  // spec/common/search.md 'Quick Filters': 칩은 다중 선택되며 AND 조건으로 스크리닝된다.
  const handleToggleQuickFilter = useCallback((key: QuickFilterKey) => {
    setActiveQuickFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  // spec/common/search.md 2.3: 카테고리 선택 시 지도 마커와 리스트가 즉시 동기화되어 렌더링
  // 특정 카테고리를 선택하면 상시시설 On/Off 토글과 무관하게 해당 카테고리 결과를 그대로 보여준다.
  // "전체" 상태일 때만 spec/map/spatial-search.md 2.2의 기본 레이어 정책(EVENT 기본 On, SPACE 토글)을 적용한다.
  const filteredItems = useMemo(() => {
    let result = items;

    if (category !== ALL_CATEGORY) {
      result = result.filter((item) => item.category === category);
    } else {
      result = result.filter((item) => item.item_type === 'EVENT' || showSpaces);
    }

    const trimmedKeyword = keyword.trim().toLowerCase();
    if (trimmedKeyword) {
      result = result.filter((item) => item.name.toLowerCase().includes(trimmedKeyword));
    }

    if (activeQuickFilters.length > 0) {
      result = result.filter((item) => matchesQuickFilters(item, activeQuickFilters));
    }

    return result;
  }, [items, category, showSpaces, keyword, activeQuickFilters]);

  const visibleItems = useMemo(() => filteredItems.slice(0, MARKER_LIMIT), [filteredItems]);
  const isOverLimit = filteredItems.length > MARKER_LIMIT;
  const isEmptyByFilter = !isLoading && !errorMessage && items.length > 0 && visibleItems.length === 0;

  // spec/space/space-card.md 3, spec/event/event-card.md 3: 카드/마커 클릭 시 지도 panTo + 상세 모달 활성화
  const handleSelectItem = useCallback((item: NearbyItem) => {
    setSelectedItem(item);
  }, []);

  const focusPosition = selectedItem ? { lat: selectedItem.lat, lng: selectedItem.lng } : null;

  return (
    <div className="relative flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* 데스크톱 좌측 패널 (spec/common/responsive.md 2.2) */}
      <aside className="hidden md:flex md:w-[400px] md:shrink-0 flex-col border-r border-gray-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
          <LocationHeader addressName={addressName} onClick={openOnboarding} />
          <SearchBar value={keyword} onChange={setKeyword} />
          <RadiusSelector value={radius} onChange={setRadius} />
          <LayerToggle showSpaces={showSpaces} onChange={setShowSpaces} />
          <CategoryFilter value={category} onChange={setCategory} />
          <QuickFilters value={activeQuickFilters} onToggle={handleToggleQuickFilter} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-gray-400">불러오는 중...</p>}
          {errorMessage && <p className="p-4 text-sm text-red-500">{errorMessage}</p>}
          {isEmptyByFilter && <EmptyState onReset={resetFilters} />}
          {!isLoading && !errorMessage && !isEmptyByFilter && (
            <ItemListPanel
              items={visibleItems}
              selectedId={selectedItem?.id ?? null}
              onSelect={handleSelectItem}
            />
          )}
        </div>
      </aside>

      {/* 지도 영역 */}
      <div className="relative flex-1">
        <KakaoMapView
          center={effectiveCenter}
          radius={radius}
          items={visibleItems}
          focusPosition={focusPosition}
          onSelectItem={handleSelectItem}
          onZoomExceedsMaxRadius={() => setShowGridViewPrompt(true)}
          onDragEnd={handleMapDragEnd}
        />

        {/* 데스크톱: 지도 상단 중앙에 재검색 Floating 버튼 노출 (지도 위 별도 오버레이 없어 최상단 사용 가능) */}
        {pendingRecenter && (
          <div className="hidden md:flex absolute top-3 left-1/2 -translate-x-1/2 z-20">
            <RecenterButton onClick={handleRecenterSearch} />
          </div>
        )}

        {/* 모바일 플로팅 헤더 (spec/common/search.md 2.1) */}
        <div className="md:hidden absolute top-3 left-3 right-3 flex flex-col gap-2 z-10">
          <LocationHeader addressName={addressName} onClick={openOnboarding} />
          <SearchBar value={keyword} onChange={setKeyword} />
          <div className="flex items-center gap-2 overflow-x-auto">
            <RadiusSelector value={radius} onChange={setRadius} />
            <LayerToggle showSpaces={showSpaces} onChange={setShowSpaces} />
          </div>
          <CategoryFilter value={category} onChange={setCategory} />
          <QuickFilters value={activeQuickFilters} onToggle={handleToggleQuickFilter} />
          {/* implementation/todo.md: 지도 드래그 후 재검색 버튼 - 모바일에서는 필터 스택 하단에 노출해 겹침 방지 */}
          {pendingRecenter && (
            <div className="flex justify-center">
              <RecenterButton onClick={handleRecenterSearch} />
            </div>
          )}
        </div>
      </div>

      {/* 모바일 바텀시트 (spec/common/responsive.md 2.1) */}
      <div
        className={`md:hidden fixed left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.08)] transition-[height] duration-200 z-10 ${
          isSheetExpanded ? 'h-[70vh]' : 'h-[112px]'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsSheetExpanded((v) => !v)}
          className="w-full flex flex-col items-center pt-2 pb-3"
        >
          <span className="w-10 h-1 rounded-full bg-gray-300" aria-hidden />
          <span className="mt-2 text-sm text-gray-600">
            주변 {visibleItems.length}건 {isSheetExpanded ? '접기' : '목록 보기'}
          </span>
        </button>
        <div className="h-[calc(100%-56px)] overflow-y-auto">
          {isEmptyByFilter && <EmptyState onReset={resetFilters} />}
          {!isEmptyByFilter && (
            <ItemListPanel
              items={visibleItems}
              selectedId={selectedItem?.id ?? null}
              onSelect={(item) => {
                handleSelectItem(item);
                setIsSheetExpanded(false);
              }}
            />
          )}
        </div>
      </div>

      {isOverLimit && (
        <Toast message="반경 내 시설이 너무 많습니다. 지도를 확대하거나 범위를 좁혀 상세히 탐색하세요." />
      )}

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      {showGridViewPrompt && (
        <GridViewPrompt
          onConfirm={() => router.push('/region')}
          onCancel={() => setShowGridViewPrompt(false)}
        />
      )}

      {isOnboardingOpen && (
        <LocationOnboardingModal onConfirm={handleConfirmLocation} onClose={closeOnboarding} />
      )}
    </div>
  );
}
