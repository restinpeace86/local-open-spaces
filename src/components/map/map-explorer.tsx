'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KakaoMapView } from '@/components/map/kakao-map-view';
import { RadiusSelector } from '@/components/map/radius-selector';
import { LayerToggle } from '@/components/map/layer-toggle';
import { SearchBar } from '@/components/map/search-bar';
import { CategoryFilter, ALL_CATEGORY } from '@/components/map/category-filter';
import { ItemListPanel } from '@/components/map/item-list-panel';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { Toast } from '@/components/map/toast';
import { getNearbySpacesAndEvents, NearbyItem } from '@/lib/spaces/get-nearby';
import { useUserLocation } from '@/hooks/use-user-location';

// spec/map/spatial-search.md 3.1: 반경 내 최대 200개 마커만 우선 렌더링
const MARKER_LIMIT = 200;

export function MapExplorer() {
  const userLocation = useUserLocation();
  const [center, setCenter] = useState(userLocation);
  const [radius, setRadius] = useState(5000);
  const [showSpaces, setShowSpaces] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setCenter(userLocation);
  }, [userLocation]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    getNearbySpacesAndEvents(center.lng, center.lat, radius)
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
  }, [center.lat, center.lng, radius]);

  const resetFilters = useCallback(() => {
    setKeyword('');
    setCategory(ALL_CATEGORY);
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

    return result;
  }, [items, category, showSpaces, keyword]);

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
          <SearchBar value={keyword} onChange={setKeyword} />
          <RadiusSelector value={radius} onChange={setRadius} />
          <LayerToggle showSpaces={showSpaces} onChange={setShowSpaces} />
          <CategoryFilter value={category} onChange={setCategory} />
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
          center={center}
          items={visibleItems}
          focusPosition={focusPosition}
          onSelectItem={handleSelectItem}
        />

        {/* 모바일 플로팅 헤더 (spec/common/search.md 2.1) */}
        <div className="md:hidden absolute top-3 left-3 right-3 flex flex-col gap-2 z-10">
          <SearchBar value={keyword} onChange={setKeyword} />
          <div className="flex items-center gap-2 overflow-x-auto">
            <RadiusSelector value={radius} onChange={setRadius} />
            <LayerToggle showSpaces={showSpaces} onChange={setShowSpaces} />
          </div>
          <CategoryFilter value={category} onChange={setCategory} />
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
    </div>
  );
}
