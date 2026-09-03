'use client';

import { useEffect, useRef, useState } from 'react';
import { loadKakaoMapSdk } from '@/lib/kakao/load-kakao-sdk';

// Task 9-5-1(2026-08-22): 상세 화면 위치 영역용 콤팩트 인앱 미니맵. 기존 KakaoMapView(지도
// 탐색 화면 — 클러스터링/반경 서클/드래그 재검색 등 무거운 기능 전부 포함)와 달리, 여기서는
// 단일 좌표 위치 미리보기만 필요해 훨씬 가벼운 단일 마커 지도로 새로 만든다.
// interactive=false(기본, 콤팩트 위젯)면 확대/이동을 꺼서 홈/상세 화면 스크롤과 충돌하지 않게
// 하고, "🔍 크게보기" 모달(interactive=true)에서만 자유롭게 조작할 수 있게 한다.
//
// [상세 모달 내 인앱 지도 및 위치 핀 표시 기능 구현](2026-08-30 사용자 지시) 요구사항 3:
// 이전까지는 Kakao Maps SDK가 로드되는 동안(비동기) 빈 div만 보여 로딩 중인지 실패한
// 것인지 구분할 수 없었다 — 스켈레톤(로딩 중)과 실패 시 주소+복사 버튼 폴백(SDK 로드
// 실패해도 유저가 위치 정보를 알 수 있게)을 추가한다. 실패해도 나머지 상세 화면은
// 정상 동작해야 하므로(제5장 제11조 무중단 원칙) throw하지 않고 상태로만 표시한다.
type LoadState = 'loading' | 'loaded' | 'error';

// [인앱 길찾기](2026-09-03 사용자 지시): 현재 위치→스팟 경로를 이 지도 위에 직접 그리기
// 위한 데이터 모양. path는 서버(/api/nearby/directions, 카카오모빌리티 길찾기 API를
// 감싼 라우트)가 반환하는 순서 있는 좌표 목록이다.
export type MiniMapRoute = {
  originLat: number;
  originLng: number;
  path: { lat: number; lng: number }[];
};

export function MiniMap({
  lat,
  lng,
  name,
  address = null,
  interactive = false,
  className = 'w-full h-40',
  route = null,
}: {
  lat: number;
  lng: number;
  name: string;
  address?: string | null;
  interactive?: boolean;
  className?: string;
  route?: MiniMapRoute | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');

    loadKakaoMapSdk()
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const position = new window.kakao.maps.LatLng(lat, lng);
        const map = new window.kakao.maps.Map(containerRef.current, { center: position, level: 4 });
        map.setDraggable(interactive);
        map.setZoomable(interactive);
        mapRef.current = map;

        const marker = new window.kakao.maps.Marker({ position, map });
        marker.setMap(map);
        setLoadState('loaded');
      })
      .catch(() => {
        // SDK 로드 실패(키 미설정, 네트워크 오류 등) 시 미니맵 없이도 나머지 상세 화면은
        // 정상 동작해야 하므로(제5장 제11조) throw하지 않는다 — 대신 아래 폴백 UI를 보여준다.
        if (!cancelled) setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, interactive]);

  // [인앱 길찾기](2026-09-03 사용자 지시): 지도 생성 effect와 완전히 분리한 독립 effect —
  // route가 나중에(버튼 클릭 후 비동기 응답으로) 채워져도 지도 자체를 다시 만들지
  // 않고 그 위에 폴리라인/출발지 마커만 추가한다(불필요한 재생성으로 사용자가 이미
  // 조작한 확대/이동 상태를 잃지 않게 함).
  useEffect(() => {
    if (!route || loadState !== 'loaded' || !mapRef.current) return;
    const map = mapRef.current;

    const linePath = route.path.map((p) => new window.kakao.maps.LatLng(p.lat, p.lng));
    const polyline = new window.kakao.maps.Polyline({
      path: linePath,
      strokeWeight: 5,
      strokeColor: '#2563eb',
      strokeOpacity: 0.85,
      strokeStyle: 'solid',
    });
    polyline.setMap(map);

    const originPosition = new window.kakao.maps.LatLng(route.originLat, route.originLng);
    const originMarker = new window.kakao.maps.Marker({
      position: originPosition,
      map,
      image: new window.kakao.maps.MarkerImage(
        `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="7" fill="#2563eb" stroke="white" stroke-width="2.5"/></svg>'
        )}`,
        new window.kakao.maps.Size(20, 20)
      ),
    });

    const bounds = new window.kakao.maps.LatLngBounds();
    bounds.extend(originPosition);
    linePath.forEach((point) => bounds.extend(point));
    map.setBounds(bounds);

    return () => {
      polyline.setMap(null);
      originMarker.setMap(null);
    };
  }, [route, loadState]);

  async function handleCopyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근이 차단된 환경에서는 조용히 무시한다.
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* 로딩 중에도 실제 지도와 동일한 크기를 차지해 도착 시 레이아웃이 흔들리지 않는다
          (다른 스켈레톤 컴포넌트들과 동일한 CLS 방지 원칙). */}
      {loadState === 'loading' && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center" role="status" aria-label={`${name} 위치 지도 불러오는 중`}>
          <span className="text-2xl" aria-hidden>🗺️</span>
        </div>
      )}
      {loadState === 'error' && (
        <div className="absolute inset-0 bg-gray-50 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
          <span className="text-2xl" aria-hidden>📍</span>
          <p className="text-xs text-gray-500">지도를 불러올 수 없습니다.</p>
          {address && (
            <>
              <p className="text-xs text-gray-700 line-clamp-1">{address}</p>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100"
              >
                {copied ? '복사됨' : '주소 복사'}
              </button>
            </>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className={`w-full h-full ${loadState === 'loaded' ? '' : 'invisible'}`}
        role="img"
        aria-label={`${name} 위치 지도`}
      />
    </div>
  );
}
