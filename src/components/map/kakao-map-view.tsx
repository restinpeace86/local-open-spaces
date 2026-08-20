'use client';

import { useEffect, useRef } from 'react';
import { loadKakaoMapSdk } from '@/lib/kakao/load-kakao-sdk';
import { buildMarkerSvgDataUrl } from '@/lib/kakao/marker-image';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { haversineDistanceMeters } from '@/lib/geo/haversine';

// spec/common/search.md 2.2: 서비스가 지원하는 최대 단일 반경(10km)을 초과하는 지도 축소를 방지한다.
const MAX_SINGLE_RADIUS_METERS = 10000;

// spec/map/kakao-map.md 3: 리사이징/회전 시 relayout()+setCenter()로 회색 타일 방지
// spec/map/kakao-map.md 4.1: 카테고리별 커스텀 마커 + MarkerClusterer 연동
export function KakaoMapView({
  center,
  radius,
  items,
  focusPosition,
  onSelectItem,
  onZoomExceedsMaxRadius,
  onDragEnd,
}: {
  center: { lat: number; lng: number };
  radius: number;
  items: NearbyItem[];
  focusPosition?: { lat: number; lng: number } | null;
  onSelectItem: (item: NearbyItem) => void;
  onZoomExceedsMaxRadius?: () => void;
  onDragEnd?: (center: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  const markersRef = useRef<kakao.maps.Marker[]>([]);
  const userCircleRef = useRef<kakao.maps.Circle | null>(null);
  const userPulseOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const lastValidLevelRef = useRef<number>(5);
  const isRevertingRef = useRef(false);
  // spec/common/search.md 2.2: 반경 버튼 클릭 등으로 발생하는 프로그래매틱 setBounds는
  // 실제 사용자 줌 아웃이 아니므로 다음 1회의 zoom_changed 초과 검사를 건너뛴다.
  const suppressZoomCheckRef = useRef(false);
  const onZoomExceedsMaxRadiusRef = useRef(onZoomExceedsMaxRadius);
  onZoomExceedsMaxRadiusRef.current = onZoomExceedsMaxRadius;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  // spec/common/search.md 2.2: 현재 선택된 반경(1km~30km)을 초과하는 지도 축소를 방지한다.
  const radiusRef = useRef(radius);
  useEffect(() => {
    radiusRef.current = radius;
  }, [radius]);

  useEffect(() => {
    let cancelled = false;

    loadKakaoMapSdk().then(() => {
      if (cancelled || !containerRef.current) return;

      const map = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level: 5,
      });
      mapRef.current = map;
      clustererRef.current = new window.kakao.maps.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 6,
      });

      // implementation/todo.md Phase 2: 내 위치 전용 펄스 마커 + 반경 Circle Overlay
      const initialPosition = new window.kakao.maps.LatLng(center.lat, center.lng);
      const circle = new window.kakao.maps.Circle({
        center: initialPosition,
        radius,
        strokeWeight: 2,
        strokeColor: '#2563eb',
        strokeOpacity: 0.85,
        strokeStyle: 'solid',
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
      });
      circle.setMap(map);
      userCircleRef.current = circle;

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

      // spec/map/spatial-search.md 3.1, 반경 선택 시 원 전체가 한눈에 들어오도록 bounds 기준 자동 줌
      suppressZoomCheckRef.current = true;
      map.setBounds(circle.getBounds());

      const handleResize = () => {
        map.relayout();
        map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      };
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);

      // spec/common/search.md 2.2: 핀치 줌/휠로 10km를 초과해 축소하면 이전 레벨로 되돌리고 광역 그리드 전환 안내를 띄운다.
      const handleZoomChanged = () => {
        if (suppressZoomCheckRef.current) {
          suppressZoomCheckRef.current = false;
          lastValidLevelRef.current = map.getLevel();
          return;
        }

        if (isRevertingRef.current) {
          isRevertingRef.current = false;
          return;
        }

        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const mapCenter = map.getCenter();
        const visibleRadius = haversineDistanceMeters(
          { lat: mapCenter.getLat(), lng: mapCenter.getLng() },
          { lat: ne.getLat(), lng: ne.getLng() }
        );

        if (visibleRadius > MAX_SINGLE_RADIUS_METERS) {
          isRevertingRef.current = true;
          map.setLevel(lastValidLevelRef.current);
          onZoomExceedsMaxRadiusRef.current?.();
        } else {
          lastValidLevelRef.current = map.getLevel();
        }
      };
      window.kakao.maps.event.addListener(map, 'zoom_changed', handleZoomChanged);

      // implementation/todo.md: 지도 드래그(dragend) 시 새로운 중심 좌표를 상위로 전달해 '이 위치에서 재검색' 버튼을 노출한다.
      // 패닝만으로는 데이터를 재조회하지 않는다(spec/common/search.md 2.2) — 버튼 클릭 시에만 상위에서 재조회를 트리거한다.
      const handleDragEnd = () => {
        const dragCenter = map.getCenter();
        onDragEndRef.current?.({ lat: dragCenter.getLat(), lng: dragCenter.getLng() });
      };
      window.kakao.maps.event.addListener(map, 'dragend', handleDragEnd);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
        window.kakao.maps.event.removeListener(map, 'zoom_changed', handleZoomChanged);
        window.kakao.maps.event.removeListener(map, 'dragend', handleDragEnd);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });

    return () => {
      cancelled = true;
    };
    // 최초 1회만 지도 인스턴스를 생성한다. center 변경은 아래 별도 effect에서 setCenter로 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // implementation/todo.md Phase 2: 위치/반경 변경 시 펄스 마커·반경 원 갱신 및 circle.getBounds() 기반 자동 줌
  useEffect(() => {
    if (!mapRef.current || !userCircleRef.current || !userPulseOverlayRef.current) return;

    const position = new window.kakao.maps.LatLng(center.lat, center.lng);
    userCircleRef.current.setPosition(position);
    userCircleRef.current.setRadius(radius);
    userPulseOverlayRef.current.setPosition(position);
    // spec/common/search.md 2.2: 반경 버튼 클릭으로 인한 자동 줌은 사용자의 수동 줌 아웃이 아니므로
    // 뒤이어 발생하는 zoom_changed의 최대 반경 초과 검사(handleZoomChanged)를 건너뛰게 한다.
    suppressZoomCheckRef.current = true;
    mapRef.current.setBounds(userCircleRef.current.getBounds());
  }, [center.lat, center.lng, radius]);

  // spec/space/space-card.md 3, spec/event/event-card.md 3: 카드/마커 선택 시 해당 좌표로 부드럽게 이동(panTo)
  useEffect(() => {
    if (!mapRef.current || !focusPosition) return;
    mapRef.current.panTo(new window.kakao.maps.LatLng(focusPosition.lat, focusPosition.lng));
  }, [focusPosition?.lat, focusPosition?.lng]);

  useEffect(() => {
    if (!mapRef.current || !clustererRef.current) return;

    clustererRef.current.clear();
    markersRef.current.forEach((marker) => marker.setMap(null));

    const markers = items.map((item) => {
      const meta = getCategoryMeta(item.category);
      const image = new window.kakao.maps.MarkerImage(
        buildMarkerSvgDataUrl(meta.color),
        new window.kakao.maps.Size(28, 36),
        { offset: new window.kakao.maps.Point(14, 36) }
      );

      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(item.lat, item.lng),
        image,
      });

      window.kakao.maps.event.addListener(marker, 'click', () => onSelectItem(item));

      return marker;
    });

    markersRef.current = markers;
    clustererRef.current.addMarkers(markers);
    // onSelectItem은 상위에서 안정적으로 전달되지 않을 수 있어 의도적으로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return <div ref={containerRef} className="w-full h-full bg-gray-100" />;
}
