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
  items,
  onSelectItem,
}: {
  center: { lat: number; lng: number };
  items: NearbyItem[];
  onSelectItem: (item: NearbyItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  const markersRef = useRef<kakao.maps.Marker[]>([]);

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

      const handleResize = () => {
        map.relayout();
        map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      };
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });

    return () => {
      cancelled = true;
    };
    // 최초 1회만 지도 인스턴스를 생성한다. center 변경은 아래 별도 effect에서 setCenter로 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [center.lat, center.lng]);

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
