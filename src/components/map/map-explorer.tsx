'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KakaoMapView } from '@/components/map/kakao-map-view';
import { SearchBar } from '@/components/map/search-bar';
import { SpotCategoryFilter } from '@/components/map/spot-category-filter';
import { ItemListPanel } from '@/components/map/item-list-panel';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { MarkerPreviewCard } from '@/components/map/marker-preview-card';
import { MarkerGroupModal } from '@/components/map/marker-group-modal';
import { AiRecommendSheet } from '@/components/map/ai-recommend-sheet';
import { AiChatFab } from '@/components/chat/ai-chat-fab';
import { Toast } from '@/components/map/toast';
import { LocationHeader } from '@/components/map/location-header';
import { LocationOnboardingModal } from '@/components/map/location-onboarding-modal';
import { RecenterButton } from '@/components/map/recenter-button';
import { MyLocationButton } from '@/components/map/my-location-button';
import { getNearbySpacesAndEvents, NearbyItem } from '@/lib/spaces/get-nearby';
import { useUserLocation } from '@/hooks/use-user-location';
import { CORE_SPOT_CATEGORIES } from '@/lib/spaces/spot-category-groups';
import { rankAiRecommendedSpots } from '@/lib/spaces/ai-recommend';

// spec/map/spatial-search.md 3.1: 반경 내 최대 1,000개 마커만 우선 렌더링
// [UI/UX 개선 및 기능 수정](2026-09-01 사용자 지시) 항목 5: 기존 200 → 1,000으로 상향.
// get_nearby_spaces_and_events RPC의 LIMIT도 함께 1,001로 올려야 한다(마커 상한보다
// 하나 더 받아 "더 많은 결과가 있다" 초과 안내를 판단하는 기존 관례 — 2026-09-01
// 마이그레이션으로 함께 반영).
const MARKER_LIMIT = 1000;

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
  const searchParams = useSearchParams();
  const radius = FIXED_RADIUS_METERS;
  const [keyword, setKeyword] = useState(() => searchParams.get('q') ?? '');
  // [스팟픽 나들이 전용 핵심 중분류 1단 필터 개편](2026-08-28~29 사용자 지시): 대분류→중분류
  // 2단 구조를 철회하고 핵심 중분류 칩만 1단으로 노출한다. UI는 "칩 id" 단위로 선택 상태를
  // 관리하고(칩 하나가 실제 category_min 여러 개를 아우를 수 있음 — 예: "박물관" 칩은 2개
  // category_min을 동시에 포함), 실제 필터링에 쓰는 category_min 배열은 선택된 칩의 minors를
  // 펼친 파생값이다.
  // [단일 선택으로 변경](2026-08-29 사용자 지시): 기존 다중 선택(최대 5개)을 철회하고 한 번에
  // 하나의 칩만 선택 가능하도록 변경 — 배열이 아니라 단일 nullable id로 상태를 단순화한다.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const selectedCategoryMins = useMemo(
    () => CORE_SPOT_CATEGORIES.find((c) => c.id === selectedCategoryId)?.minors ?? [],
    [selectedCategoryId]
  );
  // [todo.md 개선사항 6](2026-09-03): 대분류 바텀시트에서 0건 중분류를 숨기기 위한 전역
  // 카운트 — 마운트 시 한 번만 불러온다(지역과 무관, home-view.tsx의 categoryCounts와
  // 동일한 관례).
  const [categoryMinCounts, setCategoryMinCounts] = useState<Record<string, number> | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/nearby/spot-category-counts')
      .then((res) => res.json())
      .then((data: { counts?: Record<string, number> }) => {
        if (!cancelled && data.counts) setCategoryMinCounts(data.counts);
      })
      .catch(() => {
        // 카운트 조회 실패해도 바텀시트는 모든 중분류를 노출하는 안전한 기본값으로
        // 동작하므로 화면을 막지 않는다(제5장 제11조 오류 처리 원칙).
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<NearbyItem[] | null>(null);
  // [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 1: 마커를 클릭하면 곧바로 무거운
  // 전체 상세 모달을 열지 않고, 먼저 이 "미리보기" 상태만 세팅해 가벼운 미니 카드를
  // 띄운다. 그 카드를 한 번 더 터치해야만 selectedItem으로 승격되어 전체 DetailModal이
  // 열린다(표준 지도 앱의 2단계 UX). 리스트 패널/AI 추천/겹친 마커 그룹 클릭은 이미
  // 목록에서 한 번 골라 들어오는 별도의 명시적 선택 행위라 이 2단계를 거치지 않고 기존처럼
  // 바로 전체 상세로 진입한다(요구사항이 명시한 "마커 클릭"에 한정된 변경).
  const [previewItem, setPreviewItem] = useState<NearbyItem | null>(null);
  // [스팟픽 AI 추천](2026-08-29 사용자 지시): "AI 추천" 칩 클릭 시 페이지 이동 없이 지도
  // 화면 위 바텀시트로 나들이 장소를 바로 추천한다. 다른 카테고리 필터와 무관하게 항상
  // 반경 내 전체 items(원본, 필터링 전)를 대상으로 추천한다.
  const [isAiRecommendOpen, setIsAiRecommendOpen] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // [스팟픽 전국구 서버사이드 검색](2026-08-30 사용자 지시): searchResults가 null이면
  // "검색 미실행" 상태, 배열(빈 배열 포함)이면 "검색 결과" 상태를 뜻한다. 검색어가 있으면
  // 지도 중심/반경과 무관하게 이 결과를 보여주고, 검색어를 지우면 다시 반경 기반 items로
  // 돌아간다(SearchBar 자체가 이미 300ms debounce를 적용해 keyword를 넘겨주므로 여기서
  // 별도 debounce는 불필요하다).
  const [searchResults, setSearchResults] = useState<NearbyItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
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

  // [스팟픽 전국구 서버사이드 검색](2026-08-30 사용자 지시): 검색어가 있으면 현재 지도
  // 중심/반경과 무관하게 open_spaces 전체를 대상으로 한 /api/spots/search를 호출한다 —
  // 기존에는 이미 반경 내로 좁혀진 items를 클라이언트에서 다시 텍스트로 거르기만 해서,
  // 찾으려는 장소가 현재 지도 화면 밖에 있으면 원천적으로 검색되지 않는 한계가 있었다.
  useEffect(() => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setSearchResults(null);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    fetch(`/api/spots/search?q=${encodeURIComponent(trimmed)}`)
      .then((res) => res.json())
      .then((data: { items?: NearbyItem[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setSearchError(data.error);
          setSearchResults([]);
          return;
        }
        setSearchResults(Array.isArray(data.items) ? data.items : []);
      })
      .catch((err: Error) => {
        if (!cancelled) setSearchError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [keyword]);

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
    setSelectedCategoryId(null);
  }, []);

  // [단일 선택으로 변경](2026-08-29 사용자 지시): 이미 선택된 칩을 다시 누르면 선택 해제
  // (전체보기로 복귀), 다른 칩을 누르면 그 칩으로 선택이 교체된다 — 라디오 버튼과 동일한
  // 동작. 복수 선택이 아니므로 "최대 개수 초과" 상황 자체가 없다.
  const handleSelectCategory = useCallback((id: string) => {
    setSelectedCategoryId((prev) => (prev === id ? null : id));
  }, []);

  const handleOpenAiRecommend = useCallback(() => setIsAiRecommendOpen(true), []);

  const aiRecommendedItems = useMemo(() => rankAiRecommendedSpots(items), [items]);

  const handleSelectFromAiRecommend = useCallback((item: NearbyItem) => {
    setIsAiRecommendOpen(false);
    setSelectedItem(item);
  }, []);

  // spec/common/search.md 2.3: 카테고리 선택 시 지도 마커와 리스트가 즉시 동기화되어 렌더링
  // Task 9-6-10(2026-08-23): /nearby가 상시 공간 전용으로 단일화되면서(RPC가 이미 SPACE만
  // 반환) EVENT/showSpaces 토글 분기가 필요 없어졌다.
  // [스팟픽 대분류/중분류 계층적 탐색](2026-08-28): 목적별 테마(classifyThemeSpot) 대신
  // 표준 중분류(category_min) 다중 선택으로 거른다 — get_nearby_spaces_and_events RPC가
  // 이제 category_min을 반환한다(2026-08-28-nearby-rpc-category-min.sql).
  // [스팟픽 전국구 서버사이드 검색](2026-08-30 사용자 지시): 검색어가 있으면(searchResults가
  // null이 아니면) 텍스트 매칭이 이미 서버에서 끝난 전국구 결과를 기반으로 하고, 없으면
  // 기존처럼 지도 반경 내 items를 기반으로 한다. 중분류 필터는 두 경우 모두 동일하게
  // 클라이언트에서 한 번 더 좁힌다(검색 결과 안에서도 카테고리로 추가 탐색 가능).
  const isSearchMode = keyword.trim().length > 0;
  const filteredItems = useMemo(() => {
    let result = isSearchMode ? (searchResults ?? []) : items;

    if (selectedCategoryMins.length > 0) {
      result = result.filter((item) => item.category_min && selectedCategoryMins.includes(item.category_min));
    }

    return result;
  }, [isSearchMode, searchResults, items, selectedCategoryMins]);

  const visibleItems = useMemo(() => filteredItems.slice(0, MARKER_LIMIT), [filteredItems]);
  const isOverLimit = filteredItems.length > MARKER_LIMIT;
  const isBusy = isSearchMode ? isSearching : isLoading;
  const activeError = isSearchMode ? searchError : errorMessage;
  const isEmptyByFilter =
    !isBusy &&
    !activeError &&
    (isSearchMode ? searchResults !== null && visibleItems.length === 0 : items.length > 0 && visibleItems.length === 0);

  // spec/space/space-card.md 3, spec/event/event-card.md 3: 카드/마커 클릭 시 지도 panTo + 상세 모달 활성화
  // 리스트 패널 등에서 바로 전체 상세로 들어가는 경로라 열려 있던 마커 미리보기 카드가
  // 있었다면 함께 정리한다(둘이 동시에 남아있지 않도록).
  const handleSelectItem = useCallback((item: NearbyItem) => {
    setPreviewItem(null);
    setSelectedItem(item);
  }, []);

  // [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 1: 마커 클릭은 리스트/그룹
  // 클릭과 달리 전체 상세로 바로 가지 않고 미리보기 카드부터 연다. 다른 미리보기가
  // 열려 있었다면 새 마커 클릭으로 교체한다.
  const handleMarkerSelectItem = useCallback((item: NearbyItem) => {
    setPreviewItem(item);
  }, []);

  const handleOpenDetailFromPreview = useCallback(() => {
    setSelectedItem(previewItem);
    setPreviewItem(null);
  }, [previewItem]);

  const handleClosePreview = useCallback(() => {
    setPreviewItem(null);
  }, []);

  // [겹친 마커 처리](2026-08-29 사용자 지시): 같은 좌표에 여러 건이 겹쳐 있는 마커를
  // 클릭하면 상세로 바로 들어가지 않고 먼저 목록을 보여준다.
  const handleSelectGroup = useCallback((group: NearbyItem[]) => {
    setSelectedGroup(group);
  }, []);

  const handleSelectFromGroup = useCallback((item: NearbyItem) => {
    setSelectedGroup(null);
    setPreviewItem(null);
    setSelectedItem(item);
  }, []);

  // [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 1: 마커를 1단계로 클릭해
  // 미리보기 카드만 뜬 상태에서도 "마커 클릭 시 지도가 해당 위치로 이동" 요구사항을
  // 만족해야 하므로 previewItem도 focusPosition의 대상으로 삼는다(selectedItem이
  // 우선 — 2단계로 전체 상세가 열리면 그쪽 좌표로 유지).
  const focusPosition = selectedItem
    ? { lat: selectedItem.lat, lng: selectedItem.lng }
    : previewItem
    ? { lat: previewItem.lat, lng: previewItem.lng }
    : null;

  return (
    <div className="relative flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* 데스크톱 좌측 패널 (spec/common/responsive.md 2.2) */}
      <aside className="hidden md:flex md:w-[400px] md:shrink-0 flex-col border-r border-gray-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
          <LocationHeader addressName={sigunguName ?? addressName} onClick={openOnboarding} />
          <SearchBar value={keyword} onChange={setKeyword} />
          <SpotCategoryFilter
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={handleSelectCategory}
            onSelectAiRecommend={handleOpenAiRecommend}
            categoryMinCounts={categoryMinCounts}
            items={visibleItems}
            isItemsLoading={isBusy}
            onSelectItem={handleSelectItem}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {isBusy && <p className="p-4 text-sm text-gray-400">불러오는 중...</p>}
          {activeError && <p className="p-4 text-sm text-red-500">{activeError}</p>}
          {isEmptyByFilter && <EmptyState onReset={resetFilters} />}
          {!isBusy && !activeError && !isEmptyByFilter && (
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
          onSelectItem={handleMarkerSelectItem}
          onSelectGroup={handleSelectGroup}
          onDragEnd={handleMapDragEnd}
        />

        {/* [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 1: 마커 클릭 1단계 —
            전체 상세 대신 이 가벼운 미니 카드를 먼저 보여준다. 전체 상세(selectedItem)가
            열려 있을 때는 이미 handleOpenDetailFromPreview/handleSelectItem 등에서
            previewItem을 함께 정리하므로 중복 노출되지 않는다. */}
        {previewItem && (
          <MarkerPreviewCard item={previewItem} onOpenDetail={handleOpenDetailFromPreview} onClose={handleClosePreview} />
        )}

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
        {/* [UI/UX 개선 및 기능 수정](2026-09-01 사용자 지시) 항목 4: 위치 설정/검색 입력란을
            이벤트픽(HomeHeader, docs/spec.md 2.1 "고정 헤더: [위치 선택기] + [🔍 통합
            검색바]")과 동일하게 가로(flex-row, items-center)로 나란히 배치한다 — 아래
            중분류 필터/재검색 버튼 행은 계속 별도 줄로 쌓는다(HomeHeader에는 없는
            스팟픽 전용 UI라 그대로 유지). */}
        <div className="md:hidden absolute top-3 left-3 right-3 flex flex-col gap-2 z-10">
          <div className="flex items-center gap-2">
            <LocationHeader addressName={sigunguName ?? addressName} onClick={openOnboarding} />
            <div className="flex-1">
              <SearchBar value={keyword} onChange={setKeyword} />
            </div>
          </div>
          <SpotCategoryFilter
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={handleSelectCategory}
            onSelectAiRecommend={handleOpenAiRecommend}
            categoryMinCounts={categoryMinCounts}
            items={visibleItems}
            isItemsLoading={isBusy}
            onSelectItem={handleSelectItem}
          />
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
            {isSearchMode ? '검색결과' : '주변'} {visibleItems.length}건 {isSheetExpanded ? '접기' : '목록 보기'}
          </span>
        </button>
        <div className="h-[calc(100%-56px)] overflow-y-auto">
          {isBusy && <p className="p-4 text-sm text-gray-400">불러오는 중...</p>}
          {activeError && <p className="p-4 text-sm text-red-500">{activeError}</p>}
          {isEmptyByFilter && <EmptyState onReset={resetFilters} />}
          {!isBusy && !activeError && !isEmptyByFilter && (
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
        <Toast
          message={
            isSearchMode
              ? '검색 결과가 너무 많습니다. 검색어를 더 구체적으로 입력해 보세요.'
              : '반경 내 시설이 너무 많습니다. 지도를 확대하거나 범위를 좁혀 상세히 탐색하세요.'
          }
        />
      )}

      {/* [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 4: 배경 화면이 이미 지도라
          상세 모달 안의 미니맵/지도 CTA가 중복이다 — 이 화면(map-explorer)에서 여는
          DetailModal에만 hideMapSection을 넘긴다(다른 화면은 배경이 지도가 아니라
          그대로 유지). */}
      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} hideMapSection />
      )}

      {selectedGroup && (
        <MarkerGroupModal
          items={selectedGroup}
          onSelectItem={handleSelectFromGroup}
          onClose={() => setSelectedGroup(null)}
        />
      )}

      {isAiRecommendOpen && (
        <AiRecommendSheet
          items={aiRecommendedItems}
          onSelectItem={handleSelectFromAiRecommend}
          onClose={() => setIsAiRecommendOpen(false)}
        />
      )}

      {isOnboardingOpen && (
        <LocationOnboardingModal onConfirm={handleConfirmLocation} onClose={closeOnboarding} />
      )}

      {/* [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시): 기존 "AI 추천" 칩
          (AiRecommendSheet, 위에서 이미 렌더링)과 별개의 신규 플로팅 바텀시트 챗봇. */}
      <AiChatFab center={center} />
    </div>
  );
}
