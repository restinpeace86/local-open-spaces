'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KakaoMapView } from '@/components/map/kakao-map-view';
import { SearchBar } from '@/components/map/search-bar';
import { CategoryFilter, ALL_CATEGORY } from '@/components/map/category-filter';
import { QuickFilters } from '@/components/map/quick-filters';
import { ItemListPanel } from '@/components/map/item-list-panel';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { Toast } from '@/components/map/toast';
import { LocationHeader } from '@/components/map/location-header';
import { LocationOnboardingModal } from '@/components/map/location-onboarding-modal';
import { RecenterButton } from '@/components/map/recenter-button';
import { MyLocationButton } from '@/components/map/my-location-button';
import { getNearbySpacesAndEvents, NearbyItem } from '@/lib/spaces/get-nearby';
import { matchesQuickFilters, QuickFilterKey, QUICK_FILTER_OPTIONS } from '@/lib/spaces/quick-filters';
import { classifyThemeSpot, NEARBY_CATEGORY_FILTER_OPTIONS } from '@/lib/theme-spots';
import { useUserLocation } from '@/hooks/use-user-location';

// Task 9-1-9: 유효한 QuickFilterKey인지 확인(URL에서 임의 값이 들어와도 안전하게 무시).
function isQuickFilterKey(value: string): value is QuickFilterKey {
  return QUICK_FILTER_OPTIONS.some((opt) => opt.key === value);
}

// spec/map/spatial-search.md 3.1: 반경 내 최대 200개 마커만 우선 렌더링
const MARKER_LIMIT = 200;

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 3): "지도 상단 Floating 1km/5km/10km
// 반경 선택 버튼 전면 삭제"에 따라 사용자가 더 이상 반경을 고를 수 없다 — 이전 RadiusSelector의
// 기본값(5km)을 그대로 고정값으로 승계한다(임의로 새 값을 고르지 않음, 기존 동작 최대한 보존).
const FIXED_RADIUS_METERS = 5000;

export function MapExplorer() {
  const {
    center,
    addressName,
    sigunguName,
    isOnboardingOpen,
    confirmLocation,
    openOnboarding,
    closeOnboarding,
  } = useUserLocation();
  // Task 9-1(2026-08-22): 홈 화면 검색바에서 "/nearby?q=..."로 넘어온 검색어를 초기값으로 반영한다.
  // Task 9-1-9: "/nearby?filter=TODAY_WEEKEND"처럼 넘어온 Quick 필터를 초기 활성값으로 반영한다.
  // Task 9-6-6(2026-08-23) 이후: 홈 Hero Carousel의 "전체 보기" CTA는 더 이상 이 화면(지도)이
  // 아니라 /events/today로 연결되므로, 이 쿼리 파라미터 처리는 현재 실제로 이걸 넘기는 진입점이
  // 없다 — 다만 범용 기능이라 제거하지 않고 남겨둔다(향후 다른 진입점이 재사용할 수 있음).
  const searchParams = useSearchParams();
  const radius = FIXED_RADIUS_METERS;
  const [keyword, setKeyword] = useState(() => searchParams.get('q') ?? '');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [activeQuickFilters, setActiveQuickFilters] = useState<QuickFilterKey[]>(() => {
    const filterParam = searchParams.get('filter');
    return filterParam && isQuickFilterKey(filterParam) ? [filterParam] : [];
  });
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

    // Task 9-6-10(2026-08-23): /nearby를 상시 공간(open_spaces) 전용으로 단일화 — RPC에
    // item_type='SPACE'를 명시해 이벤트는 애초에 서버에서부터 받아오지 않는다.
    getNearbySpacesAndEvents(effectiveCenter.lng, effectiveCenter.lat, radius, 'SPACE')
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

  // Task 9-6-10(2026-08-23): "내 위치/설정위치 이동" 버튼 — 드래그/재검색으로 탐색 기준점이
  // 실제 설정 위치(useUserLocation의 center)에서 벗어나 있어도, 클릭 한 번으로 원래 설정
  // 위치로 되돌린다. searchOverrideCenter를 지우면 effectiveCenter가 다시 center로 돌아가고,
  // 이미 있는 데이터 재조회 effect(deps: effectiveCenter)가 자동으로 그 위치 기준으로 재조회한다.
  const handleMoveToMyLocation = useCallback(() => {
    setSearchOverrideCenter(null);
    setPendingRecenter(null);
  }, []);

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
  // Task 9-6-10(2026-08-23): /nearby가 상시 공간 전용으로 단일화되면서(RPC가 이미 SPACE만
  // 반환) EVENT/showSpaces 토글 분기가 필요 없어졌다. 카테고리 칩도 5대 UI 카테고리가 아니라
  // 목적별 테마(classifyThemeSpot, NEARBY_CATEGORY_FILTER_OPTIONS)로 거른다.
  const filteredItems = useMemo(() => {
    let result = items;

    if (category !== ALL_CATEGORY) {
      result = result.filter((item) => classifyThemeSpot(item) === category);
    }

    const trimmedKeyword = keyword.trim().toLowerCase();
    if (trimmedKeyword) {
      result = result.filter((item) => item.name.toLowerCase().includes(trimmedKeyword));
    }

    if (activeQuickFilters.length > 0) {
      result = result.filter((item) => matchesQuickFilters(item, activeQuickFilters));
    }

    return result;
  }, [items, category, keyword, activeQuickFilters]);

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
          <LocationHeader addressName={sigunguName ?? addressName} onClick={openOnboarding} />
          <SearchBar value={keyword} onChange={setKeyword} />
          <CategoryFilter value={category} onChange={setCategory} options={NEARBY_CATEGORY_FILTER_OPTIONS} />
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
          onDragEnd={handleMapDragEnd}
        />

        {/* 데스크톱: 지도 상단 중앙에 재검색 Floating 버튼 노출 (지도 위 별도 오버레이 없어 최상단 사용 가능) */}
        {pendingRecenter && (
          <div className="hidden md:flex absolute top-3 left-1/2 -translate-x-1/2 z-20">
            <RecenterButton onClick={handleRecenterSearch} />
          </div>
        )}

        {/* Task 9-6-10(2026-08-23): "내 위치/설정위치로 이동" 버튼 — 지도 우하단, 뷰포트/기기와
            무관하게 항상 노출(RecenterButton과 달리 pendingRecenter 여부에 의존하지 않음). */}
        <div className="absolute bottom-4 right-4 z-20">
          <MyLocationButton onClick={handleMoveToMyLocation} />
        </div>

        {/* 모바일 플로팅 헤더 (spec/common/search.md 2.1) */}
        <div className="md:hidden absolute top-3 left-3 right-3 flex flex-col gap-2 z-10">
          <LocationHeader addressName={sigunguName ?? addressName} onClick={openOnboarding} />
          <SearchBar value={keyword} onChange={setKeyword} />
          <CategoryFilter value={category} onChange={setCategory} options={NEARBY_CATEGORY_FILTER_OPTIONS} />
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
      {/* Task 9-1-7: 하단 5탭(BottomTabs)이 화면 최하단에 항상 고정 노출되므로, 바텀시트를
          bottom-0으로 두면 탭바를 가려버린다. 탭바 높이만큼(bottom-16) 띄워 겹치지 않게 한다. */}
      <div
        className={`md:hidden fixed left-0 right-0 bottom-16 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.08)] transition-[height] duration-200 z-10 ${
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

      {isOnboardingOpen && (
        <LocationOnboardingModal onConfirm={handleConfirmLocation} onClose={closeOnboarding} />
      )}
    </div>
  );
}
