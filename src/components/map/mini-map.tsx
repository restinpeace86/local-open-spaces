'use client';

import { useEffect, useRef } from 'react';
import { loadKakaoMapSdk } from '@/lib/kakao/load-kakao-sdk';

// Task 9-5-1(2026-08-22): 상세 화면 위치 영역용 콤팩트 인앱 미니맵. 기존 KakaoMapView(지도
// 탐색 화면 — 클러스터링/반경 서클/드래그 재검색 등 무거운 기능 전부 포함)와 달리, 여기서는
// 단일 좌표 위치 미리보기만 필요해 훨씬 가벼운 단일 마커 지도로 새로 만든다.
// interactive=false(기본, 콤팩트 위젯)면 확대/이동을 꺼서 홈/상세 화면 스크롤과 충돌하지 않게
// 하고, "🔍 크게보기" 모달(interactive=true)에서만 자유롭게 조작할 수 있게 한다.
export function MiniMap({
  lat,
  lng,
  name,
  interactive = false,
  className = 'w-full h-40',
}: {
  lat: number;
  lng: number;
  name: string;
  interactive?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadKakaoMapSdk().then(() => {
      if (cancelled || !containerRef.current) return;

      const position = new window.kakao.maps.LatLng(lat, lng);
      const map = new window.kakao.maps.Map(containerRef.current, { center: position, level: 4 });
      map.setDraggable(interactive);
      map.setZoomable(interactive);
      mapRef.current = map;

      const marker = new window.kakao.maps.Marker({ position, map });
      marker.setMap(map);
    }).catch(() => {
      // SDK 로드 실패(키 미설정, 네트워크 오류 등) 시 미니맵 없이도 나머지 상세 화면은
      // 정상 동작해야 하므로 조용히 무시한다(제11조 오류 처리 원칙 — 서비스 중단 금지).
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, interactive]);

  return <div ref={containerRef} className={className} role="img" aria-label={`${name} 위치 지도`} />;
}
