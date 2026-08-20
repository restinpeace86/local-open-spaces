'use client';

import { useEffect, useRef } from 'react';
import { loadKakaoMapSdk } from '@/lib/kakao/load-kakao-sdk';
import { buildMarkerSvgDataUrl } from '@/lib/kakao/marker-image';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// spec/map/kakao-map.md 3: 리사이징/회전 시 relayout()+setCenter()로 회색 타일 방지
// spec/map/kakao-map.md 4.1: 카테고리별 커스텀 마커 + MarkerClusterer 연동
export function KakaoMapView({
  center,
  radius,
  items,
  focusPosition,
  onSelectItem,
  onDragEnd,
}: {
  center: { lat: number; lng: number };
  radius: number;
  items: NearbyItem[];
  focusPosition?: { lat: number; lng: number } | null;
  onSelectItem: (item: NearbyItem) => void;
  onDragEnd?: (center: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  const markersRef = useRef<kakao.maps.Marker[]>([]);
  const userCircleRef = useRef<kakao.maps.Circle | null>(null);
  const userPulseOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

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
        // implementation/todo.md: 클러스터 버블도 파란 반경 서클 위에서 묻히지 않도록
        // 마커와 동일한 코랄-레드오렌지 계열 고대비 스타일을 적용한다.
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
      map.setBounds(circle.getBounds());

      const handleResize = () => {
        map.relayout();
        map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      };
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);

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
