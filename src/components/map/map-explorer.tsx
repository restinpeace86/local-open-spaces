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
import { GpsSyncModal } from '@/components/map/gps-sync-modal';
import { RecenterButton } from '@/components/map/recenter-button';
import { MyLocationButton } from '@/components/map/my-location-button';
import { getNearbySpacesAndEvents, getSpotsByServiceCategory, getSpotGroupMembers, NearbyItem } from '@/lib/spaces/get-nearby';
import { ServiceCategory } from '@/lib/admin/service-category';
import { useUserLocation } from '@/hooks/use-user-location';
import { useGpsSyncCheck } from '@/hooks/use-gps-sync-check';
import { useLiveGpsPosition } from '@/hooks/use-live-gps-position';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import { getProvinceFromText, getVisibleProvinces, isSpotInProvinces } from '@/lib/spaces/province';
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

// [바텀시트 GPS 거리순 정렬 + 반경 선택](2026-09-08 사용자 지시): "바텀시트에
// 보이는 것중에는 반경 컷오프로.. 반경 5km 혹은 10km 내 20km 내에 거리순으로
// 보이도록.. 거리 눌러서 적용할수있게" — 기존엔 10km 고정이었으나, 이제 관리자가
// 아니라 사용자가 5/10/20km 중 눌러서 고를 수 있다. 기본값은 기존 고정값(10km)을
// 그대로 승계한다.
const DEFAULT_SHEET_RADIUS_KM = 10;

// [노출 중분류 전역 노출 시 지도 줌 레벨](2026-09-08 사용자 지시): "반경 컷오프
// 완전 폐지 + 도 전역 노출로 해줘(지도에 찍히는 거 기준)" — 마커 데이터 자체는
// 전국 단위인데 지도가 계속 5km 기준 줌 레벨에 머물러 있으면 흩어진 마커 대부분이
// 화면 밖이라 "전역 노출"이 실제로는 안 보인다. KakaoMapView의 radiusToLevel은
// 최대 레벨 10(가장 넓은 줌)까지만 허용하므로, 그 상한에 닿도록 충분히 큰 값을
// 넘긴다(정확한 값 자체는 중요하지 않다 — 이미 level 10에서 clamp되므로).
const CATEGORY_WIDE_VIEW_RADIUS_METERS = 200000;

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
  // [실시간 위치 싱크(GPS Sync 팝업)](2026-09-08 사용자 지시, todo.md 개선사항3-3)
  const { suggestion: gpsSyncSuggestion, dismiss: dismissGpsSync } = useGpsSyncCheck(center, isOnboardingOpen);
  // [바텀시트 GPS 거리순 정렬](2026-09-08 개선사항3-1): 위 훅과 별개로 바텀시트
  // 정렬에도 같은 실시간 GPS 좌표가 필요하다(내부적으로 동일한 훅을 공유해 중복
  // 조회 없음 — useGpsSyncCheck도 useLiveGpsPosition을 그대로 쓴다).
  const liveGpsPosition = useLiveGpsPosition();
  // Task 9-1(2026-08-22): 홈 화면 검색바에서 "/nearby?q=..."로 넘어온 검색어를 초기값으로 반영한다.
  const searchParams = useSearchParams();
  const radius = FIXED_RADIUS_METERS;
  const [keyword, setKeyword] = useState(() => searchParams.get('q') ?? '');
  // [노출 중분류 기준 카테고리 필터 전면 교체](2026-09-08 사용자 지시): "현재 노출
  // 중분류 기준으로 카테고리 필터 전면교체할것" — 예전엔 표준 중분류(category_min)
  // 기반 CORE_SPOT_CATEGORIES였지만, 이제 관리자가 직접 큐레이션하는
  // service_categories(노출 중분류)를 단일 출처로 쓴다. selectedCategoryId는 이제
  // service_categories.id(uuid)를 담는다. 단일 선택 정책(2026-08-29)은 그대로
  // 유지한다.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  // [개선사항 6과 동일한 원칙] 대분류 바텀시트에서 0건 중분류를 숨기기 위한 전역
  // 카운트 — 마운트 시 한 번만 불러온다(지역과 무관).
  const [serviceCategoryCounts, setServiceCategoryCounts] = useState<Record<string, number> | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/nearby/service-categories')
      .then((res) => res.json())
      .then((data: { items?: ServiceCategory[]; counts?: Record<string, number> }) => {
        if (cancelled) return;
        if (data.items) setServiceCategories(data.items);
        if (data.counts) setServiceCategoryCounts(data.counts);
      })
      .catch(() => {
        // 조회 실패해도 대분류 탭 자체가 안 뜰 뿐 나머지 화면(반경 기반 기본 목록)은
        // 정상 동작하므로 화면을 막지 않는다(제5장 제11조 오류 처리 원칙).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // [반경 컷오프 완전 폐지 + 도 전역 노출](2026-09-08 사용자 지시): "반경 컷오프
  // 완전 폐지 + 도 전역 노출로 해줘(지도에 찍히는 거 기준).. 지도는 중분류 항목에
  // 대하여 해당 데이터들 전역 노출" — 노출 중분류를 하나 고르면, 지도 중심/반경과
  // 무관하게 그 중분류에 매핑된 전체 스팟을 전국 단위로 가져온다(get-nearby.ts의
  // getSpotsByServiceCategory, 신규 RPC). 선택 해제하면 기존 반경 기반 기본 목록
  // (아래 items)으로 돌아간다.
  const [categoryItems, setCategoryItems] = useState<NearbyItem[]>([]);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedCategoryId) {
      setCategoryItems([]);
      setCategoryError(null);
      return;
    }
    let cancelled = false;
    setIsCategoryLoading(true);
    setCategoryError(null);
    getSpotsByServiceCategory(selectedCategoryId)
      .then((result) => {
        if (!cancelled) setCategoryItems(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setCategoryError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsCategoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId]);

  // [노출 중분류 선택 시 현재 위치의 도(道) 단위로 제한](2026-09-10 사용자 지시,
  // project/decision-log.md): 반경 컷오프는 폐지 상태 그대로 두되, 노출 중분류
  // 전역 조회 결과를 "현재 설정 위치가 포함하는 도" 범위로 좁힌다 — 판교(경기)면
  // 경기+서울, 강릉이면 강원. 노출 중분류 기준이라 도 단위 데이터가 충분히 커버
  // 가능한 양이라, RPC를 바꾸지 않고 클라이언트에서 필터한다(회귀 위험 최소화).
  // 현재 위치의 도를 판별하지 못하면(주소/시군구명에 광역 표기 없음) 필터하지
  // 않는다(안전 폴백 — 근거 없이 스팟을 숨기지 않음).
  const currentProvince = getProvinceFromText(addressName) ?? getProvinceFromText(sigunguName);
  const visibleProvinces = getVisibleProvinces(currentProvince);
  const provinceScopedCategoryItems = useMemo(() => {
    if (!visibleProvinces) return categoryItems;
    return categoryItems.filter((item) => isSpotInProvinces(item.address, item.sigungu_name, visibleProvinces));
    // visibleProvinces는 매 렌더 새 배열이라 원시값(currentProvince)으로 의존한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryItems, currentProvince]);

  // [바텀시트 반경 선택](2026-09-08 사용자 지시): 5/10/20km 중 사용자가 눌러서
  // 고를 수 있다. 지도(전역 노출)와는 무관하게 바텀시트 결과 리스트에만 적용된다.
  const [sheetRadiusKm, setSheetRadiusKm] = useState(DEFAULT_SHEET_RADIUS_KM);

  const [items, setItems] = useState<NearbyItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<NearbyItem[] | null>(null);
  // [장소 단위 대표 1건 노출 — 그룹 펼쳐보기](2026-09-09 사용자 지시): 겹친 마커 그룹
  // (좌표 우연 일치)과 group_id 그룹(관리자가 명시적으로 같은 장소로 묶은 예약 옵션들)은
  // 개념이 달라 모달 문구를 구분한다 — null이면 MarkerGroupModal 기본 문구를 그대로 쓴다.
  const [groupModalTitle, setGroupModalTitle] = useState<string | null>(null);
  const [isExpandingGroup, setIsExpandingGroup] = useState(false);
  const [groupExpandError, setGroupExpandError] = useState<string | null>(null);
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

  // [제휴 상품 ↔ 스팟픽 마커 연동](2026-09-10 사용자 지시, todo.md 개선사항6):
  // 노출 활성화된 제휴 상품이 연동된 스팟 목록을 한 번 불러와, 지도에서는 특가
  // 마커로 강조하고 상세/프리뷰 카드에서는 제휴 링크로 연결한다.
  const [dealBySpotId, setDealBySpotId] = useState<Record<string, { title: string; bookingUrl: string }>>({});
  useEffect(() => {
    let cancelled = false;
    fetch('/api/nearby/deal-spots')
      .then((res) => res.json())
      .then((data: { deals?: Record<string, { title: string; bookingUrl: string }> }) => {
        if (!cancelled && data.deals) setDealBySpotId(data.deals);
      })
      .catch(() => {
        // 실패해도 일반 마커로 정상 동작한다(제5장 제11조).
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const dealSpotIds = useMemo(() => new Set(Object.keys(dealBySpotId)), [dealBySpotId]);

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

  // [실시간 위치 싱크(GPS Sync 팝업)](2026-09-08 사용자 지시, todo.md 개선사항3-3):
  // "수락 시 기본 위치 설정을 현재 GPS 기준으로 업데이트합니다" — 동네를 직접
  // 재설정하는 것과 동일하게 처리한다(드래그/재검색으로 벗어나 있던 임시 기준점도
  // 함께 초기화).
  const handleAcceptGpsSync = useCallback(() => {
    if (!gpsSyncSuggestion) return;
    handleConfirmLocation(gpsSyncSuggestion);
    dismissGpsSync();
  }, [gpsSyncSuggestion, handleConfirmLocation, dismissGpsSync]);

  // implementation/todo.md: dragend 발생 시 새로운 지도 중심을 재검색 후보로 저장해 Floating 버튼을 노출한다.
  // [노출 중분류 전역 노출](2026-09-08 사용자 지시): 중분류가 선택된 동안은 표시되는
  // 데이터가 지도 중심/반경과 무관한 전국 단위라, "이 위치에서 재검색" 버튼이
  // 눌러도 아무 것도 바꾸지 못하는 죽은 버튼이 된다 — 아예 뜨지 않게 dragend 자체를
  // 무시한다.
  const handleMapDragEnd = useCallback(
    (dragCenter: { lat: number; lng: number }) => {
      if (selectedCategoryId) return;
      setPendingRecenter(dragCenter);
    },
    [selectedCategoryId]
  );

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

  // [스팟픽 첫 진입 시 AI 추천 오탭 방지](2026-09-05 사용자 지시): "default로 가져오게
  // 하지마 눌렀을때만 가져오게 해" — rankAiRecommendedSpots 자체는 순수 클라이언트 연산
  // (실제 LLM 호출이나 네트워크 요청이 아니다 — ai-recommend.ts 상단 주석 참고)이지만,
  // 기존엔 useMemo로 items가 바뀔 때마다(지도를 드래그해 반경이 갱신될 때마다) AI 추천
  // 시트를 열어본 적이 없어도 매번 재계산하고 있었다. 클릭한 시점의 items로 딱 한 번만
  // 계산해 상태에 담아두는 방식으로 바꿔 "누르기 전엔 아무 것도 계산하지 않는다"를
  // 문자 그대로 지킨다.
  const [aiRecommendedItems, setAiRecommendedItems] = useState<NearbyItem[]>([]);
  const handleOpenAiRecommend = useCallback(() => {
    setAiRecommendedItems(rankAiRecommendedSpots(items));
    setIsAiRecommendOpen(true);
  }, [items]);

  const handleSelectFromAiRecommend = useCallback((item: NearbyItem) => {
    setIsAiRecommendOpen(false);
    setSelectedItem(item);
  }, []);

  // spec/common/search.md 2.3: 카테고리 선택 시 지도 마커와 리스트가 즉시 동기화되어 렌더링
  // Task 9-6-10(2026-08-23): /nearby가 상시 공간 전용으로 단일화되면서(RPC가 이미 SPACE만
  // 반환) EVENT/showSpaces 토글 분기가 필요 없어졌다.
  // [노출 중분류 기준 카테고리 필터 전면 교체 + 반경 컷오프 폐지](2026-09-08 사용자
  // 지시): 우선순위는 검색 > 노출 중분류 선택 > 기본(반경 기반) 순이다.
  // - 검색어가 있으면(searchResults가 null이 아니면) 텍스트 매칭이 이미 서버에서
  //   끝난 전국구 결과를 그대로 쓴다(카테고리 필터는 이 모드에선 적용하지 않는다 —
  //   콕 짚어 찾는 검색 결과를 노출 중분류로 다시 좁히면 오히려 못 찾는 회귀가 될
  //   수 있어 기존 "검색 모드 최우선" 원칙을 그대로 유지한다).
  // - 노출 중분류를 선택했으면 categoryItems(반경 무관 전국 조회)를 쓴다 — 지도는
  //   전역 노출, 반경 컷오프가 아예 없다.
  // - 둘 다 아니면 기존처럼 반경(5km) 기반 items를 쓴다.
  const isSearchMode = keyword.trim().length > 0;
  // 지도 마커 / 데스크톱 목록: 노출 중분류 선택 시 현재 위치 도(道) 단위로 제한
  // (Decision 023). 반경 컷오프는 없다.
  const baseItems = isSearchMode ? (searchResults ?? []) : selectedCategoryId ? provinceScopedCategoryItems : items;

  const visibleItems = useMemo(() => baseItems.slice(0, MARKER_LIMIT), [baseItems]);
  const isOverLimit = baseItems.length > MARKER_LIMIT;

  // [바텀시트 GPS 거리순 정렬 + 반경 선택](2026-09-08 사용자 지시): "바텀시트에
  // 보이는 것중에는.. 반경 5km 혹은 10km 내 20km 내에 거리순으로 보이도록.. 거리
  // 눌러서 적용" — 지도 마커/데스크톱 목록(visibleItems)은 위에서 이미 확정된
  // 소스를 그대로 쓰고, 바텀시트 리스트만 실시간 GPS 좌표 기준으로 다시 정렬
  // + 선택한 반경(sheetRadiusKm)으로 제한한다. baseItems(1,000건으로 잘리기 전
  // 원본)를 기준으로 계산해야 한다 — 노출 중분류 전역 조회는 정렬 기준이 없어
  // (전역 조회라 서버가 거리로 정렬해 줄 기준점 자체가 없음) 앞쪽 1,000건만 잘라
  // 거리 계산을 하면 실제로 가장 가까운 항목이 잘려나간 뒤일 수 있다. GPS를 못
  // 가져왔으면(권한 거부 등) 기존 목록(최대 1,000건)으로 조용히 폴백한다(제5장
  // 제11조). 검색 모드는 "이름으로 콕 짚어 찾는" 목적이라 이 재정렬을 적용하지
  // 않는다(기존 원칙 그대로).
  // [반경 필터·거리순 정렬이 GPS 없을 때 통째로 빠지던 버그 수정](2026-09-10 사용자
  // 지시, todo.md 개선사항2-1·2-5): "반경 10km(Default)를 설정했음에도... 전혀
  // 범위를 벗어난 원거리 지역(예: 경북 칠곡군 등)의 장소들이 상단에 노출... 274건
  // 카운트가 실제 반경과 맞지 않음". 원인 — 실시간 GPS 좌표(liveGpsPosition)가
  // 없으면(권한 거부/미허용) 반경 필터·거리순 정렬·거리 표시를 전부 건너뛰고
  // 노출 중분류 전역 조회 결과(전국구)를 그대로 내려주고 있었다. GPS가 없어도
  // 사용자가 설정/온보딩한 위치(effectiveCenter)는 항상 있으므로 그걸 기준점으로
  // 폴백해 반경 필터·거리순 정렬·거리(km) 계산을 "항상" 적용한다. 검색 모드는
  // "이름으로 콕 짚어 찾는" 목적이라 이 재정렬을 적용하지 않는다(기존 원칙).
  //
  // [바텀시트는 도 단위 사전 필터 없이 순수 반경 기준](2026-09-10 사용자 지시,
  // Decision 023): "바텀시트는 지도 마커 도단위 표시와 다르게 반경 설정하도록
  // 되어있으니 반경 기준으로 나오는게 맞음 — 도단위 사전 필터 없이." 그래서
  // 바텀시트 소스는 provinceScopedCategoryItems(=baseItems)가 아니라 광역 필터
  // 이전의 categoryItems를 쓴다. 도 경계에 걸친 인접 스팟(예: 평택에서 10km인
  // 천안 스팟)도 선택 반경 안이면 리스트/건수에 포함된다.
  const sheetSourceItems = isSearchMode
    ? (searchResults ?? [])
    : selectedCategoryId
    ? categoryItems
    : items;
  const originLat = liveGpsPosition?.lat ?? effectiveCenter.lat;
  const originLng = liveGpsPosition?.lng ?? effectiveCenter.lng;
  const mobileSheetItems = useMemo(() => {
    if (isSearchMode) return sheetSourceItems.slice(0, MARKER_LIMIT);
    const origin = { lat: originLat, lng: originLng };
    return sheetSourceItems
      .map((item) => ({ item, gpsDistance: haversineDistanceMeters(origin, { lat: item.lat, lng: item.lng }) }))
      .filter(({ gpsDistance }) => gpsDistance <= sheetRadiusKm * 1000)
      .sort((a, b) => a.gpsDistance - b.gpsDistance)
      // ItemListPanel은 item.distance_meters를 그대로 표시하므로, 여기서
      // 기준점 기준 실제 거리로 덮어써야 화면에 보이는 거리도 정렬 기준과 일치한다.
      .map(({ item, gpsDistance }) => ({ ...item, distance_meters: gpsDistance }));
  }, [isSearchMode, sheetSourceItems, originLat, originLng, sheetRadiusKm]);

  // [스팟픽 리스트 카드 뱃지](2026-09-10 사용자 지시, todo.md 개선사항2-3): 목록에
  // 보이는 스팟들의 맞춤형 뱃지를 배치로 한 번에 가져와 ItemListPanel에 넘긴다.
  // 목록에 실제로 나오는 항목(바텀시트 + 데스크톱 목록)의 id만 대상으로 한다.
  const listBadgeIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const it of mobileSheetItems) ids.add(it.id);
    for (const it of visibleItems) ids.add(it.id);
    return [...ids].sort().join(',');
  }, [mobileSheetItems, visibleItems]);
  const [badgesBySpotId, setBadgesBySpotId] = useState<Record<string, { labels: string[]; minAge: number }>>({});
  useEffect(() => {
    if (!listBadgeIdsKey) {
      setBadgesBySpotId({});
      return;
    }
    let cancelled = false;
    const ids = listBadgeIdsKey.split(',').slice(0, 200).join(',');
    fetch(`/api/nearby/spot-badges?ids=${encodeURIComponent(ids)}`)
      .then((res) => res.json())
      .then((data: { badges?: Record<string, { labels: string[]; minAge: number }> }) => {
        if (!cancelled) setBadgesBySpotId(data.badges ?? {});
      })
      .catch(() => {
        // 실패해도 목록은 상호명/거리/주소로 정상 노출된다(제5장 제11조).
      });
    return () => {
      cancelled = true;
    };
  }, [listBadgeIdsKey]);

  const isBusy = isSearchMode ? isSearching : selectedCategoryId ? isCategoryLoading : isLoading;
  const activeError = isSearchMode ? searchError : selectedCategoryId ? categoryError : errorMessage;
  const isEmptyByFilter =
    !isBusy &&
    !activeError &&
    (isSearchMode
      ? searchResults !== null && visibleItems.length === 0
      : selectedCategoryId
      ? provinceScopedCategoryItems.length === 0
      : items.length > 0 && visibleItems.length === 0);

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
  // [마커 미리보기 카드가 바텀시트를 가리는 문제 수정](2026-09-05 사용자 지시): "마커
  // 누르면 하단에 정보가 뜨는데.. 하단의 바텀시트를 가리게 됨." 미리보기 카드 자체는
  // 접힌 바텀시트 위쪽으로 옮겨 겹치지 않게 했지만(marker-preview-card.tsx), 바텀시트가
  // 펼쳐진(70vh) 상태에서 마커를 누르면 그 큰 시트가 카드를 다시 가릴 수 있어, 마커를
  // 누르는 순간 시트를 접어 항상 카드가 보이게 한다(리스트에서 항목을 고를 때 이미
  // 동일하게 처리하던 것과 같은 정책 — 위 handleSelectItem 참고).
  // [마커 카드 ↔ 상세 카드 일원화](2026-09-10 사용자 지시, todo.md 개선사항2-6):
  // "마커 클릭 시 뜨는 카드의 레이아웃을 상세 카드와 동일한 구조(좌측 이미지,
  // 상호명, 거리, 주소, 카테고리 맞춤형 뱃지)로 통일". 노출 중분류 전역 조회는
  // 서버 distance_meters가 -1이라(거리 기준점이 없음), 바텀시트와 동일하게 여기서
  // 기준점(GPS 또는 설정 위치)으로부터의 실제 거리를 계산해 채워 넣는다 — 이
  // 카드를 다시 눌러 여는 상세 카드(handleOpenDetailFromPreview)도 이 값을 그대로
  // 물려받아 거리/길찾기가 동작한다.
  const handleMarkerSelectItem = useCallback(
    (item: NearbyItem) => {
      const gpsDistance = haversineDistanceMeters(
        { lat: originLat, lng: originLng },
        { lat: item.lat, lng: item.lng }
      );
      setPreviewItem({ ...item, distance_meters: gpsDistance });
      setIsSheetExpanded(false);
    },
    [originLat, originLng]
  );

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
    setGroupModalTitle(null);
    setSelectedGroup(group);
  }, []);

  const handleSelectFromGroup = useCallback((item: NearbyItem) => {
    setSelectedGroup(null);
    setGroupModalTitle(null);
    setPreviewItem(null);
    setSelectedItem(item);
  }, []);

  // [장소 단위 대표 1건 노출 — 그룹 펼쳐보기](2026-09-09 사용자 지시): 상세 모달에서
  // "이 장소의 다른 예약 옵션 보기"를 누르면 같은 group_id의 전체 멤버(대표 포함)를
  // 가져와 기존 MarkerGroupModal로 보여준다 — 그중 하나를 고르면 handleSelectFromGroup이
  // 그대로 그 멤버의 전체 상세를 연다(겹친 마커 흐름과 동일한 마무리 경로 재사용).
  const handleExpandGroup = useCallback(async (groupId: string) => {
    setIsExpandingGroup(true);
    try {
      const members = await getSpotGroupMembers(groupId);
      setSelectedItem(null);
      setGroupModalTitle('이 장소의 다른 예약 옵션');
      setSelectedGroup(members);
    } catch {
      // 제5장 제11조: 실패해도 서비스가 멈추지 않게 짧은 안내만 띄우고 기존 상세는 유지한다.
      setGroupExpandError('다른 옵션을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      setTimeout(() => setGroupExpandError(null), 2500);
    } finally {
      setIsExpandingGroup(false);
    }
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

  // [노출 중분류 전역 노출 시 지도 줌 레벨](2026-09-08 사용자 지시): 중분류를
  // 선택하면 데이터가 전국 단위로 흩어져 있어, 기존 5km 기준 줌 레벨 그대로면
  // 대부분의 마커가 화면 밖이라 "전역 노출"이 체감되지 않는다 — KakaoMapView가
  // 지원하는 가장 넓은 줌 레벨로 시작하도록 큰 값을 넘긴다.
  const mapRadius = selectedCategoryId ? CATEGORY_WIDE_VIEW_RADIUS_METERS : radius;

  return (
    <div className="relative flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* 데스크톱 좌측 패널 (spec/common/responsive.md 2.2) */}
      <aside className="hidden md:flex md:w-[400px] md:shrink-0 flex-col border-r border-gray-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
          <LocationHeader addressName={sigunguName ?? addressName} onClick={openOnboarding} />
          <SearchBar value={keyword} onChange={setKeyword} />
          <SpotCategoryFilter
            serviceCategories={serviceCategories}
            serviceCategoryCounts={serviceCategoryCounts}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={handleSelectCategory}
            onSelectAiRecommend={handleOpenAiRecommend}
            items={mobileSheetItems}
            badgesBySpotId={badgesBySpotId}
            isItemsLoading={isBusy}
            onSelectItem={handleSelectItem}
            sheetRadiusKm={sheetRadiusKm}
            onSelectSheetRadiusKm={setSheetRadiusKm}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {isBusy && <p className="p-4 text-sm text-gray-400">불러오는 중...</p>}
          {activeError && <p className="p-4 text-sm text-red-500">{activeError}</p>}
          {isEmptyByFilter && <EmptyState onReset={resetFilters} />}
          {!isBusy && !activeError && !isEmptyByFilter && (
            <ItemListPanel
              items={visibleItems}
              badgesBySpotId={badgesBySpotId}
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
          radius={mapRadius}
          items={visibleItems}
          dealSpotIds={dealSpotIds}
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
          <MarkerPreviewCard
            item={previewItem}
            deal={dealBySpotId[previewItem.id] ?? null}
            onOpenDetail={handleOpenDetailFromPreview}
            onClose={handleClosePreview}
          />
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
            serviceCategories={serviceCategories}
            serviceCategoryCounts={serviceCategoryCounts}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={handleSelectCategory}
            onSelectAiRecommend={handleOpenAiRecommend}
            items={mobileSheetItems}
            badgesBySpotId={badgesBySpotId}
            isItemsLoading={isBusy}
            onSelectItem={handleSelectItem}
            sheetRadiusKm={sheetRadiusKm}
            onSelectSheetRadiusKm={setSheetRadiusKm}
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
            {isSearchMode ? '검색결과' : '주변'} {mobileSheetItems.length}건 {isSheetExpanded ? '접기' : '목록 보기'}
          </span>
        </button>
        {/* [바텀시트 반경 선택](2026-09-08 사용자 지시): "반경 5km 혹은 10km 내 20km
            내에 거리순으로 보이도록.. 거리 눌러서 적용할수있게" — 검색 모드는 이
            반경이 적용되지 않아(위 mobileSheetItems 참고) 숨긴다. */}
        {!isSearchMode && (
          <div className="flex items-center justify-center gap-1.5 pb-2">
            <span className="text-[11px] text-gray-400">반경</span>
            {[5, 10, 20].map((km) => (
              <button
                key={km}
                type="button"
                aria-pressed={sheetRadiusKm === km}
                onClick={() => setSheetRadiusKm(km)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                  sheetRadiusKm === km
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {km}km
              </button>
            ))}
          </div>
        )}
        <div className="h-[calc(100%-96px)] overflow-y-auto">
          {isBusy && <p className="p-4 text-sm text-gray-400">불러오는 중...</p>}
          {activeError && <p className="p-4 text-sm text-red-500">{activeError}</p>}
          {isEmptyByFilter && <EmptyState onReset={resetFilters} />}
          {!isBusy && !activeError && !isEmptyByFilter && (
            <ItemListPanel
              items={mobileSheetItems}
              badgesBySpotId={badgesBySpotId}
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
              : selectedCategoryId
              ? '선택하신 중분류에 해당하는 시설이 너무 많습니다. 지도를 확대해 세부 지역을 살펴보세요.'
              : '반경 내 시설이 너무 많습니다. 지도를 확대하거나 범위를 좁혀 상세히 탐색하세요.'
          }
        />
      )}

      {/* [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 4: 배경 화면이 이미 지도라
          상세 모달 안의 미니맵/지도 CTA가 중복이다 — 이 화면(map-explorer)에서 여는
          DetailModal에만 hideMapSection을 넘긴다(다른 화면은 배경이 지도가 아니라
          그대로 유지). */}
      {selectedItem && (
        <DetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          hideMapSection
          spotPickCard
          deal={dealBySpotId[selectedItem.id] ?? null}
          onExpandGroup={handleExpandGroup}
          isExpandingGroup={isExpandingGroup}
        />
      )}

      {selectedGroup && (
        <MarkerGroupModal
          items={selectedGroup}
          onSelectItem={handleSelectFromGroup}
          onClose={() => {
            setSelectedGroup(null);
            setGroupModalTitle(null);
          }}
          title={groupModalTitle ?? undefined}
        />
      )}

      {groupExpandError && <Toast message={groupExpandError} />}

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

      {/* [실시간 위치 싱크(GPS Sync 팝업)](2026-09-08 todo.md 개선사항3-3): 온보딩이
          열려 있을 때는 useGpsSyncCheck 자체가 검사를 건너뛰므로 동시에 뜰 일이 없다. */}
      {gpsSyncSuggestion && (
        <GpsSyncModal
          neighborhoodName={gpsSyncSuggestion.sigungu_name ?? gpsSyncSuggestion.address_name}
          onConfirm={handleAcceptGpsSync}
          onDismiss={dismissGpsSync}
        />
      )}

      {/* [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시): 기존 "AI 추천" 칩
          (AiRecommendSheet, 위에서 이미 렌더링)과 별개의 신규 플로팅 바텀시트 챗봇. */}
      <AiChatFab center={center} />
    </div>
  );
}
