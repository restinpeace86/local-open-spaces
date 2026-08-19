'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KakaoMapView } from '@/components/map/kakao-map-view';
import { RadiusSelector } from '@/components/map/radius-selector';
import { LayerToggle } from '@/components/map/layer-toggle';
import { ItemListPanel } from '@/components/map/item-list-panel';
import { ItemInfoCard } from '@/components/map/item-info-card';
import { Toast } from '@/components/map/toast';
import { getNearbySpacesAndEvents, NearbyItem } from '@/lib/spaces/get-nearby';

// spec/map/spatial-search.md 3.1: 반경 내 최대 200개 마커만 우선 렌더링
const MARKER_LIMIT = 200;

// 기본 위치: 서울시청 (위치 권한 거부/미지원 시 폴백)
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

export function MapExplorer() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [radius, setRadius] = useState(5000);
  const [showSpaces, setShowSpaces] = useState(false);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        // 위치 권한 거부/실패 시 기본 위치(서울시청) 유지
      },
      { timeout: 5000 }
    );
  }, []);

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

  // spec/map/spatial-search.md 2.2: 시한성 정보(EVENT)는 기본 On, 상시 시설(SPACE)은 토글로만 On
  const filteredItems = useMemo(
    () => items.filter((item) => item.item_type === 'EVENT' || showSpaces),
    [items, showSpaces]
  );
  const visibleItems = useMemo(() => filteredItems.slice(0, MARKER_LIMIT), [filteredItems]);
  const isOverLimit = filteredItems.length > MARKER_LIMIT;

  const handleSelectItem = useCallback((item: NearbyItem) => {
    setSelectedItem(item);
  }, []);

  return (
    <div className="relative flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* 데스크톱 좌측 패널 (spec/common/responsive.md 2.2) */}
      <aside className="hidden md:flex md:w-[400px] md:shrink-0 flex-col border-r border-gray-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
          <RadiusSelector value={radius} onChange={setRadius} />
          <LayerToggle showSpaces={showSpaces} onChange={setShowSpaces} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-gray-400">불러오는 중...</p>}
          {errorMessage && <p className="p-4 text-sm text-red-500">{errorMessage}</p>}
          {!isLoading && !errorMessage && (
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
        <KakaoMapView center={center} items={visibleItems} onSelectItem={handleSelectItem} />

        {/* 모바일 플로팅 헤더 (spec/common/search.md 2.1) */}
        <div className="md:hidden absolute top-3 left-3 right-3 flex flex-col gap-2 z-10">
          <div className="flex items-center gap-2 overflow-x-auto">
            <RadiusSelector value={radius} onChange={setRadius} />
            <LayerToggle showSpaces={showSpaces} onChange={setShowSpaces} />
          </div>
        </div>

        {selectedItem && (
          <div className="absolute left-3 right-3 bottom-3 md:bottom-4 md:left-4 md:right-4 z-20">
            <ItemInfoCard item={selectedItem} onClose={() => setSelectedItem(null)} />
          </div>
        )}
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
          <ItemListPanel
            items={visibleItems}
            selectedId={selectedItem?.id ?? null}
            onSelect={(item) => {
              handleSelectItem(item);
              setIsSheetExpanded(false);
            }}
          />
        </div>
      </div>

      {isOverLimit && (
        <Toast message="반경 내 시설이 너무 많습니다. 지도를 확대하거나 범위를 좁혀 상세히 탐색하세요." />
      )}
    </div>
  );
}
