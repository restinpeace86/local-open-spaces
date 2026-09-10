'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadKakaoMapSdk } from '@/lib/kakao/load-kakao-sdk';
import { buildMarkerSvgDataUrl, buildDealMarkerSvgDataUrl } from '@/lib/kakao/marker-image';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { MarkerPreviewCard } from '@/components/map/marker-preview-card';

// Task 9-6-10(2026-08-23): 파란 반경 원(Circle)이 하던 "반경에 맞춰 지도를 자동으로 맞춤"
// 역할을 원 없이 대체한다. 카카오맵 레벨은 숫자가 커질수록 축소(더 넓은 범위)되는데, 정확한
// 화면 폭 대 레벨 대응은 기기 픽셀 밀도에 따라 달라져 브라우저 실측 없이 딱 맞는 표를 단정하지
// 않는다 — 대신 "반경이 2배가 될 때마다 레벨이 1.5 정도 넓어진다"는 근사 공식을 쓴다(레벨
// 6 = 반경 5km를 기준점으로 잡음, RadiusSelector 기본값과 일치). 3~10 범위로 clamp한다.
function radiusToLevel(radiusMeters: number): number {
  const level = 6 + Math.log2(radiusMeters / 5000) * 1.5;
  return Math.min(10, Math.max(3, Math.round(level)));
}

// spec/map/kakao-map.md 3: 리사이징/회전 시 relayout()+setCenter()로 회색 타일 방지
// spec/map/kakao-map.md 4.1: 카테고리별 커스텀 마커 + MarkerClusterer 연동
export function KakaoMapView({
  center,
  radius,
  items,
  dealSpotIds,
  dealBySpotId,
  focusedItemId,
  originLat,
  originLng,
  focusPosition,
  onSelectItem,
  onSelectGroup,
  onDragEnd,
}: {
  center: { lat: number; lng: number };
  radius: number;
  items: NearbyItem[];
  // [제휴 상품 연동 특별 마커](2026-09-10 사용자 지시, todo.md 개선사항6): 노출
  // 활성화된 제휴 상품이 연동된 스팟 id 집합. 이 스팟들은 🔥 특가 마커로 그린다.
  dealSpotIds?: Set<string>;
  // [마커 프리뷰 카드](2026-09-10 사용자 지시): 프리뷰 카드에 표시할 제휴 상품 맵.
  dealBySpotId?: Record<string, { title: string; bookingUrl: string }>;
  // [포커스 마커 강조](2026-09-10 사용자 지시): "어떤 마커 눌렀는지 알 수 있게
  // 포커스 동안은 마커 크기를 기본의 2배 이상으로." 현재 상세 카드가 열려 있는
  // 스팟(또는 리스트에서 마지막으로 고른 스팟)의 마커를 크게 그린다.
  focusedItemId?: string | null;
  // 거리 기준점(GPS 또는 설정 위치) — 노출 중분류 전역 조회 결과는 서버 거리가
  // -1이라, 프리뷰/상세 진입 시 이 좌표로 실제 거리를 계산해 채운다.
  originLat?: number;
  originLng?: number;
  focusPosition?: { lat: number; lng: number } | null;
  // [마커 클릭/호버 → 상세 진입](2026-09-10 사용자 지시): PC는 마커 호버 시
  // 프리뷰 카드(마커에 앵커), 클릭 시 상세. 모바일은 첫 탭에 프리뷰, 프리뷰
  // 탭에 상세. onSelectItem은 "상세 카드로 진입"을 의미한다.
  onSelectItem: (item: NearbyItem) => void;
  // [겹친 마커 처리](2026-08-29 사용자 지시): 원본 데이터가 동일 좌표를 공유하는 경우
  // (예: 아파트 단지 내 개별 놀이터가 단지 대표 주소 좌표로만 등록된 경우) 마커가 완전히
  // 겹쳐 맨 위 1개만 클릭되던 문제 — 같은 좌표에 2건 이상이 있으면 onSelectItem 대신
  // onSelectGroup으로 그 전체 목록을 전달해 상위에서 선택 목록을 먼저 보여주게 한다.
  onSelectGroup?: (items: NearbyItem[]) => void;
  // Task 9-6-10(2026-08-23): 이름은 dragend 그대로 두지만(호출부 API 변경 최소화), 실제로는
  // 드래그(dragend)와 줌 변경(zoom_changed) 둘 다에서 호출된다 — 상위가 "지도가 사용자
  // 조작으로 움직였다"는 신호로 받아 재검색 버튼을 띄우는 용도라 이름을 굳이 바꾸지 않았다.
  onDragEnd?: (center: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  const markersRef = useRef<kakao.maps.Marker[]>([]);
  const userPulseOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  // [마커 프리뷰 카드 — 마커에 앵커](2026-09-10 사용자 지시): 프리뷰 카드를 마커
  // 좌표에 붙은 CustomOverlay 안(포털)으로 렌더링해, 지도를 움직여도 마커와 함께
  // 이동하게 한다("가운데 고정으로 뜨면 마커랑 따로 노는 것처럼 보임").
  const previewOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const [previewAnchorEl, setPreviewAnchorEl] = useState<HTMLElement | null>(null);
  const [previewItem, setPreviewItem] = useState<NearbyItem | null>(null);
  const previewItemRef = useRef<NearbyItem | null>(null);
  previewItemRef.current = previewItem;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // PC(정밀 포인터 + 호버 지원) 여부 — 호버로 프리뷰, 클릭으로 상세.
  const canHoverRef = useRef(false);
  const onSelectItemRef = useRef(onSelectItem);
  onSelectItemRef.current = onSelectItem;
  const onSelectGroupRef = useRef(onSelectGroup);
  onSelectGroupRef.current = onSelectGroup;
  const originRef = useRef<{ lat?: number; lng?: number }>({ lat: originLat, lng: originLng });
  originRef.current = { lat: originLat, lng: originLng };
  const dealBySpotIdRef = useRef(dealBySpotId);
  dealBySpotIdRef.current = dealBySpotId;

  // [포커스 마커 강조](2026-09-10 사용자 지시): id → { marker, 기본 이미지, 2배 이미지 }.
  // 마커를 매번 다시 만들지 않고, 포커스/호버가 바뀔 때 해당 마커의 이미지만 교체한다.
  const markerRegistryRef = useRef<Map<string, { marker: kakao.maps.Marker; normal: kakao.maps.MarkerImage; big: kakao.maps.MarkerImage }>>(new Map());
  const emphasizedIdRef = useRef<string | null>(null);
  const focusedItemIdRef = useRef<string | null>(focusedItemId ?? null);
  focusedItemIdRef.current = focusedItemId ?? null;

  function applyEmphasis(nextId: string | null) {
    const reg = markerRegistryRef.current;
    const prev = emphasizedIdRef.current;
    if (prev && prev !== nextId) {
      const e = reg.get(prev);
      if (e) (e.marker as unknown as { setImage?: (i: kakao.maps.MarkerImage) => void }).setImage?.(e.normal);
    }
    if (nextId) {
      const e = reg.get(nextId);
      if (e) {
        (e.marker as unknown as { setImage?: (i: kakao.maps.MarkerImage) => void; setZIndex?: (z: number) => void }).setImage?.(e.big);
        (e.marker as unknown as { setZIndex?: (z: number) => void }).setZIndex?.(9);
      }
    }
    emphasizedIdRef.current = nextId;
  }
  // 호버 프리뷰가 떠 있으면 그 마커를, 아니면 상세 카드가 연 마커를 강조한다.
  function refreshEmphasis() {
    applyEmphasis(previewItemRef.current?.id ?? focusedItemIdRef.current);
  }

  // 노출 중분류 전역 조회 결과는 서버 거리가 -1 — 프리뷰/상세 진입 시 기준점으로 보정.
  function withDistance(item: NearbyItem): NearbyItem {
    const { lat, lng } = originRef.current;
    if (item.distance_meters >= 0 || lat == null || lng == null) return item;
    return { ...item, distance_meters: haversineDistanceMeters({ lat, lng }, { lat: item.lat, lng: item.lng }) };
  }

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }
  function showPreview(item: NearbyItem) {
    clearHideTimer();
    const enriched = withDistance(item);
    setPreviewItem(enriched);
    previewItemRef.current = enriched;
    const ov = previewOverlayRef.current;
    if (ov && mapRef.current) {
      ov.setPosition(new window.kakao.maps.LatLng(item.lat, item.lng));
      ov.setMap(mapRef.current);
    }
    refreshEmphasis();
  }
  function hidePreview() {
    clearHideTimer();
    setPreviewItem(null);
    previewItemRef.current = null;
    previewOverlayRef.current?.setMap(null);
    refreshEmphasis();
  }
  function scheduleHide() {
    clearHideTimer();
    hideTimerRef.current = setTimeout(hidePreview, 220);
  }
  function goDetail(item: NearbyItem) {
    hidePreview();
    onSelectItemRef.current(withDistance(item));
  }
  // [지도 중심 불일치 버그 수정](2026-08-29 사용자 제보: "위치는 성남시 분당구인데 지도는
  // 서울시청"): 아래 최초 지도 생성 effect는 deps가 []라 마운트 시점 단 한 번만 실행되는데,
  // `loadKakaoMapSdk()`가 비동기(스크립트 로드)라 그 콜백이 실제로 실행되는 시점은 항상
  // 나중이다. 반면 `useUserLocation`이 LocalStorage에서 저장된 위치를 읽어 `center`를
  // 기본값(서울시청)에서 실제 위치로 갱신하는 것은 마운트 직후 매우 빠르게(동기적 읽기 +
  // 리렌더 1회) 끝난다 — 즉 SDK 로드가 끝나기 전에 `center` prop은 이미 최신 값으로
  // 바뀌어 있는 게 보통이다. 그런데 deps=[] effect의 콜백 클로저는 "처음 실행됐을 때"의
  // `center`/`radius` 값을 그대로 캡처해버려(리렌더와 무관하게 고정), SDK 로드가 끝난
  // 시점에 실제로는 최신 위치가 아니라 마운트 당시의 값(서울시청)으로 지도를 생성했다.
  // 이후 별도 effect(아래, deps=[center.lat, center.lng, radius])가 panTo로 보정을
  // 시도하지만, 그 effect가 먼저 실행될 때는 아직 `mapRef.current`가 없어(지도가 채
  // 생성되기 전) 아무 것도 하지 못하고 조용히 종료되며, 이후 `center`가 다시 바뀌지 않는 한
  // 재시도되지 않는다. 매 렌더마다 최신 값을 담아두는 ref를 두고, 비동기 콜백 내부에서는
  // (클로저가 아니라) 이 ref를 읽어 항상 "지금 시점의" 값을 쓰도록 한다.
  const centerRef = useRef(center);
  centerRef.current = center;
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  // Task 9-6-10(2026-08-23): center/radius prop이 바뀌어 아래 effect가 프로그램적으로
  // setLevel()을 호출해도 'zoom_changed'가 발생한다(카카오맵 API 특성 — 사용자가 직접
  // 확대/축소했을 때와 구분이 안 됨). 그 프로그램적 변경까지 "사용자가 줌을 바꿨다"로 오인해
  // 매 검색마다 재검색 버튼이 떴다 사라지는 것을 막기 위한 억제 플래그.
  const suppressNextZoomEventRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    loadKakaoMapSdk().then(() => {
      if (cancelled || !containerRef.current) return;

      const map = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(centerRef.current.lat, centerRef.current.lng),
        level: radiusToLevel(radiusRef.current),
      });
      mapRef.current = map;
      // Task 9-6-10(2026-08-23): minLevel을 6→5로 낮춰 기본 반경(5km, 레벨 6)에서도 클러스터링이
      // 바로 활성화되도록 했다 — 레벨 5보다 확대(레벨 1~4)해야 개별 핀으로 풀리고, 그 사이
      // 레벨(5~10)에서는 카카오맵 자체 그리드 알고리즘이 줌에 따라 격자 크기를 다시 계산해
      // 광역(시/군) 단위의 큰 묶음 → 구/동 단위의 작은 묶음으로 자연스럽게 재편된다(별도의
      // "여러 단계" 설정 없이 MarkerClusterer 하나가 원래 이렇게 동작함). gridSize를 기본값(60)
      // 보다 넓혀(80) 저zoom에서 묶임이 더 뚜렷하게 보이도록 했다.
      clustererRef.current = new window.kakao.maps.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 5,
        gridSize: 80,
        // implementation/todo.md: 클러스터 버블이 지도 배경 위에서 눈에 띄도록 마커와 동일한
        // 코랄-레드오렌지 계열 고대비 스타일을 적용한다.
        styles: [
          {
            width: '40px',
            height: '40px',
            background: 'rgba(255, 61, 0, 0.92)',
            borderRadius: '9999px',
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: '40px',
            fontSize: '13px',
            fontWeight: '700',
            border: '2px solid #ffffff',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
          },
        ],
      });

      // implementation/todo.md Phase 2: 내 위치(탐색 기준점) 전용 펄스 마커.
      // Task 9-6-10(2026-08-23): 파란 반경 원(Circle)은 제거했다 — "이 안의 시설만 검색됨"을
      // 오해하게 하고(실제로는 원 밖 마커도 뷰포트에 들어오면 보임), 클러스터 버블과도 시각적으로
      // 겹쳐 혼란을 준다는 지적. 펄스 마커(내 위치 표시 자체)는 계속 남긴다.
      const initialPosition = new window.kakao.maps.LatLng(centerRef.current.lat, centerRef.current.lng);
      const pulseContent = document.createElement('div');
      pulseContent.className = 'user-location-pulse';
      const pulseOverlay = new window.kakao.maps.CustomOverlay({
        position: initialPosition,
        content: pulseContent,
        zIndex: 10,
        xAnchor: 0.5,
        yAnchor: 0.5,
      });
      pulseOverlay.setMap(map);
      userPulseOverlayRef.current = pulseOverlay;

      // [마커 프리뷰 카드 앵커](2026-09-10): 마커 좌표에 붙는 빈 컨테이너 오버레이.
      // 실제 카드는 아래 createPortal로 이 div에 렌더링한다. yAnchor=1이면 오버레이
      // 아래 끝이 마커 위치 — 카드가 마커 위쪽에 뜬다.
      canHoverRef.current =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const previewEl = document.createElement('div');
      const previewOverlay = new window.kakao.maps.CustomOverlay({
        position: initialPosition,
        content: previewEl,
        zIndex: 40,
        xAnchor: 0.5,
        yAnchor: 1,
      });
      previewOverlayRef.current = previewOverlay;
      setPreviewAnchorEl(previewEl);

      const handleResize = () => {
        map.relayout();
        map.setCenter(new window.kakao.maps.LatLng(centerRef.current.lat, centerRef.current.lng));
      };
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);

      // implementation/todo.md: 지도 드래그(dragend) 시 새로운 중심 좌표를 상위로 전달해 '이 위치에서 재검색' 버튼을 노출한다.
      // 패닝만으로는 데이터를 재조회하지 않는다(spec/common/search.md 2.2) — 버튼 클릭 시에만 상위에서 재조회를 트리거한다.
      const handleDragEnd = () => {
        const newCenter = map.getCenter();
        onDragEndRef.current?.({ lat: newCenter.getLat(), lng: newCenter.getLng() });
      };
      // Task 9-6-10(2026-08-23): 줌 레벨 변경 시에도 동일하게 재검색 버튼을 띄운다 — 드래그
      // 없이 확대/축소만 해도 화면에 보이는 실제 범위가 달라지기 때문. 단, center/radius prop
      // 변경으로 이 컴포넌트가 프로그램적으로 setLevel()을 호출한 경우는 사용자 조작이 아니므로
      // suppressNextZoomEventRef로 걸러낸다.
      const handleZoomChanged = () => {
        if (suppressNextZoomEventRef.current) {
          suppressNextZoomEventRef.current = false;
          return;
        }
        const newCenter = map.getCenter();
        onDragEndRef.current?.({ lat: newCenter.getLat(), lng: newCenter.getLng() });
      };
      window.kakao.maps.event.addListener(map, 'dragend', handleDragEnd);
      window.kakao.maps.event.addListener(map, 'zoom_changed', handleZoomChanged);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
        window.kakao.maps.event.removeListener(map, 'dragend', handleDragEnd);
        window.kakao.maps.event.removeListener(map, 'zoom_changed', handleZoomChanged);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });

    return () => {
      cancelled = true;
    };
    // 최초 1회만 지도 인스턴스를 생성한다. center 변경은 아래 별도 effect에서 setCenter로 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Task 9-6-10(2026-08-23) 버그 수정: 상위 전역 위치가 바뀌어도(예: 온보딩에서 새 위치 확정,
  // 또는 재검색 버튼 클릭) 지도가 실제로 그 위치로 이동하지 않던 문제 — 예전에는 여기서 원
  // (userCircleRef)의 bounds로만 setBounds를 걸었는데, 원을 제거하면서 그 경로가 통째로 없어져
  // center가 바뀌어도 지도가 반응하지 않았다. panTo(부드러운 이동)+setLevel(반경에 맞는 확대
  // 정도)을 명시적으로 호출해 center/radius prop이 바뀔 때마다 지도가 확실히 따라가게 한다.
  useEffect(() => {
    if (!mapRef.current || !userPulseOverlayRef.current) return;

    const position = new window.kakao.maps.LatLng(center.lat, center.lng);
    userPulseOverlayRef.current.setPosition(position);
    mapRef.current.panTo(position);

    // setLevel을 같은 값으로 호출하면 'zoom_changed'가 아예 발생하지 않아, 미리 세워둔 억제
    // 플래그가 다음 실제 사용자 줌 조작까지 그대로 남아 그걸 잘못 억제하게 된다 — 실제로
    // 레벨이 바뀔 때만 플래그를 세운다.
    const newLevel = radiusToLevel(radius);
    if (mapRef.current.getLevel() !== newLevel) {
      suppressNextZoomEventRef.current = true;
      mapRef.current.setLevel(newLevel);
    }
  }, [center.lat, center.lng, radius]);

  // spec/space/space-card.md 3, spec/event/event-card.md 3: 카드/마커 선택 시 해당 좌표로 부드럽게 이동(panTo)
  useEffect(() => {
    if (!mapRef.current || !focusPosition) return;
    mapRef.current.panTo(new window.kakao.maps.LatLng(focusPosition.lat, focusPosition.lng));
  }, [focusPosition?.lat, focusPosition?.lng]);

  useEffect(() => {
    if (!mapRef.current || !clustererRef.current) return;

    // [카테고리 필터 클러스터 카운트 누적 버그 수정](2026-08-29 사용자 제보: "필터를
    // 껐다 켰다 반복하면 지도 위 숫자가 계속 누적된다"): 이전에 "필터 토글마다 마커를
    // id 기준으로 diff해서 유지되는 항목은 재생성하지 않는" 최적화를 시도했으나, 실측
    // 결과 `MarkerClusterer.removeMarker(marker, true)`로 제거한 마커가 클러스터러
    // 내부 카운트에서 완전히 빠지지 않고, 이후 그 항목이 다시 필터에 포함될 때 새 마커
    // 객체가 추가로 등록되어 같은 항목이 중복 집계되는 것을 확인했다(반복할수록
    // 클러스터 숫자가 계속 불어남 — 실제 재현 및 원인 확인 완료). 안정성을 위해
    // "매번 전체 제거 후 전체 재생성" 방식으로 되돌린다 — 필터 토글 시 약간의 렌더링
    // 비용이 있지만(최대 200개), 데이터 정합성이 성능보다 우선한다.
    clustererRef.current.clear();
    markersRef.current.forEach((marker) => marker.setMap(null));
    markerRegistryRef.current.clear();
    emphasizedIdRef.current = null;

    // 좌표가 완전히 동일한(소수 6자리 기준, 약 0.1m 이내) 항목들을 한 그룹으로 묶어,
    // 마커 클릭 시 몇 건이 겹쳐 있는지 판별한다.
    const groupsByPosition = new Map<string, NearbyItem[]>();
    for (const item of items) {
      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      const group = groupsByPosition.get(key);
      if (group) {
        group.push(item);
      } else {
        groupsByPosition.set(key, [item]);
      }
    }

    // 포커스 마커는 기본 크기의 2.4배로 그린다(사용자 지시: "기본크기의 2배 이상").
    const EMPHASIS = 2.4;
    const markers = items.map((item) => {
      const meta = getCategoryMeta(item.category);
      const isDeal = dealSpotIds?.has(item.id) ?? false;
      const src = isDeal ? buildDealMarkerSvgDataUrl() : buildMarkerSvgDataUrl(meta.color);
      const [w, h] = isDeal ? [34, 44] : [28, 36];
      const normal = new window.kakao.maps.MarkerImage(src, new window.kakao.maps.Size(w, h), {
        offset: new window.kakao.maps.Point(w / 2, h),
      });
      const big = new window.kakao.maps.MarkerImage(
        src,
        new window.kakao.maps.Size(Math.round(w * EMPHASIS), Math.round(h * EMPHASIS)),
        { offset: new window.kakao.maps.Point(Math.round((w * EMPHASIS) / 2), Math.round(h * EMPHASIS)) }
      );

      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(item.lat, item.lng),
        image: normal,
      });
      // 특가 마커는 일반 마커 위로 올려 겹칠 때 가려지지 않게 한다(로컬 kakao 타입
      // 정의에 setZIndex가 빠져 있어 캐스팅해서 호출한다 — 실제 SDK엔 존재).
      if (isDeal) (marker as unknown as { setZIndex?: (z: number) => void }).setZIndex?.(5);
      markerRegistryRef.current.set(item.id, { marker, normal, big });

      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      const isGrouped = (groupsByPosition.get(key)?.length ?? 1) > 1;

      window.kakao.maps.event.addListener(marker, 'click', () => {
        const group = groupsByPosition.get(key) ?? [item];
        // 좌표가 겹친 여러 건 → 기존처럼 선택 목록(MarkerGroupModal) 먼저.
        if (group.length > 1 && onSelectGroupRef.current) {
          hidePreview();
          onSelectGroupRef.current(group);
          return;
        }
        // [마커 클릭/호버 → 상세](2026-09-10 사용자 지시): PC(호버 가능)는 클릭 시
        // 바로 상세. 모바일은 첫 탭에 프리뷰, 같은 마커 재탭에 상세.
        if (canHoverRef.current) {
          goDetail(item);
        } else if (previewItemRef.current?.id === item.id) {
          goDetail(item);
        } else {
          showPreview(item);
        }
      });

      // PC 전용: 마커에 마우스를 올리면 프리뷰가 마커 위에 뜨고, 벗어나면 잠시 뒤
      // 사라진다(마커→카드로 옮기는 사이 유지되도록 지연). 겹친 마커는 호버 프리뷰
      // 대상이 아니다(클릭 시 선택 목록으로).
      if (!isGrouped) {
        window.kakao.maps.event.addListener(marker, 'mouseover', () => {
          if (canHoverRef.current) showPreview(item);
        });
        window.kakao.maps.event.addListener(marker, 'mouseout', () => {
          if (canHoverRef.current) scheduleHide();
        });
      }

      return marker;
    });

    markersRef.current = markers;
    clustererRef.current.addMarkers(markers);
    // 마커를 다시 만든 직후, 현재 포커스/호버 대상 마커를 크게 반영한다.
    refreshEmphasis();
    // onSelectItem/onSelectGroup은 ref로 최신값을 읽으므로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dealSpotIds]);

  // [포커스 마커 강조](2026-09-10 사용자 지시): 상세 카드가 연 스팟(focusedItemId)이
  // 바뀌면 해당 마커만 크게/원래대로 이미지 교체.
  useEffect(() => {
    refreshEmphasis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedItemId]);

  // 언마운트 시 프리뷰 타이머/오버레이 정리.
  useEffect(() => {
    return () => {
      clearHideTimer();
      previewOverlayRef.current?.setMap(null);
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="w-full h-full bg-gray-100" />
      {previewAnchorEl &&
        previewItem &&
        createPortal(
          <MarkerPreviewCard
            item={previewItem}
            deal={dealBySpotIdRef.current?.[previewItem.id] ?? null}
            onOpenDetail={() => goDetail(previewItem)}
            onClose={hidePreview}
            onMouseEnter={clearHideTimer}
            onMouseLeave={() => {
              if (canHoverRef.current) scheduleHide();
            }}
          />,
          previewAnchorEl
        )}
    </>
  );
}
