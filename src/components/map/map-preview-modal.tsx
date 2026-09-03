'use client';

import { useState } from 'react';
import { MiniMap, MiniMapRoute } from '@/components/map/mini-map';
import { useModalBackClose } from '@/hooks/use-modal-back-close';

// [인앱 길찾기](2026-09-03 사용자 지시): "지도에서 보기가 확대/축소밖에 안 된다 — 현재
// 위치 기준 길찾기가 없다"는 지적에 따라 추가한다. 카카오모빌리티 자동차 길찾기 API를
// 서버 라우트(/api/nearby/directions)로 감싸 호출하고, 받은 경로를 MiniMap 위에 직접
// 그린다 — 2026-08-30에 없앤 "외부 지도 앱으로 나가는 길찾기"를 되살리는 게 아니라,
// 그 결정의 취지(앱 이탈 없이 위치 확인)를 유지한 채 순수 데이터만 인앱 지도에 얹는
// 별개의 기능이다.
type RouteSummary = { distanceMeters: number; durationSeconds: number };
type FindRouteState = 'idle' | 'locating' | 'fetching' | 'done' | 'error';

// [예상 소요시간 표시] 초 단위를 "N분"(1시간 미만) 또는 "H시간 M분"으로 사람이 읽기
// 좋은 형태로 바꾼다 — 카카오모빌리티 응답의 duration은 초 단위 정수다(실측 확인).
function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function formatDistanceKm(meters: number): string {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}

// Task 9-5-1(2026-08-22): 미니맵의 "🔍 크게보기" 버튼이 여는 풀스크린 지도 모달.
export function MapPreviewModal({
  lat,
  lng,
  name,
  address = null,
  onClose,
}: {
  lat: number;
  lng: number;
  name: string;
  address?: string | null;
  onClose: () => void;
}) {
  // Task 9-6-17: DetailModal 위에 겹쳐 열리는 레이어이므로 자체 히스토리 state를 하나 더
  // 쌓는다 — 뒤로가기 1회는 이 모달만 닫고(DetailModal은 유지), 그다음 뒤로가기에서
  // DetailModal이 닫히도록 레이어별로 독립 처리한다.
  useModalBackClose(onClose);

  const [findRouteState, setFindRouteState] = useState<FindRouteState>('idle');
  const [route, setRoute] = useState<MiniMapRoute | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  function handleFindRoute() {
    if (findRouteState === 'locating' || findRouteState === 'fetching') return;
    setRouteError(null);
    setFindRouteState('locating');

    if (!navigator.geolocation) {
      setFindRouteState('error');
      setRouteError('이 브라우저에서는 위치 확인을 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setFindRouteState('fetching');
        try {
          const params = new URLSearchParams({
            origin_lat: String(position.coords.latitude),
            origin_lng: String(position.coords.longitude),
            dest_lat: String(lat),
            dest_lng: String(lng),
          });
          const res = await fetch(`/api/nearby/directions?${params.toString()}`);
          const data: {
            distanceMeters?: number;
            durationSeconds?: number;
            path?: { lat: number; lng: number }[];
            error?: string;
          } = await res.json();
          if (!res.ok || !data.path) throw new Error(data.error ?? '경로를 찾을 수 없습니다.');

          setRoute({ originLat: position.coords.latitude, originLng: position.coords.longitude, path: data.path });
          setRouteSummary({ distanceMeters: data.distanceMeters ?? 0, durationSeconds: data.durationSeconds ?? 0 });
          setFindRouteState('done');
        } catch (err) {
          setFindRouteState('error');
          setRouteError(err instanceof Error ? err.message : '경로를 찾을 수 없습니다.');
        }
      },
      () => {
        setFindRouteState('error');
        setRouteError('위치 권한이 거부되었거나 확인할 수 없습니다.');
      },
      { timeout: 5000 }
    );
  }

  return (
    // DetailModal 위에 겹쳐 렌더링되므로(같은 DOM 트리 안), 여기서 클릭 이벤트가 계속
    // 버블링되면 하단 DetailModal의 onClick={onClose}까지 같이 실행돼 둘 다 닫혀버린다.
    // stopPropagation으로 이 모달 선에서 이벤트를 끊는다.
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="relative w-full h-full md:w-[90vw] md:h-[85vh] md:rounded-2xl overflow-hidden bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="지도 닫기"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-600 hover:text-gray-900"
        >
          ✕
        </button>
        <MiniMap lat={lat} lng={lng} name={name} address={address} interactive className="w-full h-full" route={route} />

        {/* [인앱 길찾기](2026-09-03 사용자 지시): 지도 하단에 떠 있는 길찾기 액션 —
            평소엔 버튼만, 경로를 찾으면 거리/소요시간 요약으로 바뀐다. */}
        <div className="absolute bottom-3 left-3 right-3 z-10 flex justify-center">
          {findRouteState === 'idle' || findRouteState === 'error' ? (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleFindRoute}
                className="rounded-full bg-blue-600 text-white text-sm font-semibold px-4 py-2 shadow-lg hover:bg-blue-700"
              >
                🧭 현재 위치에서 길찾기
              </button>
              {routeError && (
                <p className="rounded-full bg-white/95 text-xs text-red-600 px-3 py-1 shadow">{routeError}</p>
              )}
            </div>
          ) : findRouteState === 'locating' || findRouteState === 'fetching' ? (
            <p className="rounded-full bg-white/95 text-xs font-medium text-gray-600 px-4 py-2 shadow-lg">
              {findRouteState === 'locating' ? '📍 현재 위치 확인 중...' : '🧭 경로 찾는 중...'}
            </p>
          ) : (
            routeSummary && (
              <div className="flex items-center gap-2 rounded-full bg-white/95 shadow-lg px-4 py-2">
                <span className="text-sm font-semibold text-gray-900">
                  🚗 {formatDistanceKm(routeSummary.distanceMeters)} · 약 {formatDuration(routeSummary.durationSeconds)}
                </span>
                <button
                  type="button"
                  onClick={handleFindRoute}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  다시 찾기
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
