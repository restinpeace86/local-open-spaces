'use client';

import { useEffect, useRef } from 'react';
import { loadKakaoMapSdk } from '@/lib/kakao/load-kakao-sdk';
import { buildMarkerSvgDataUrl } from '@/lib/kakao/marker-image';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { NearbyItem } from '@/lib/spaces/get-nearby';

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
  focusPosition,
  onSelectItem,
  onSelectGroup,
  onDragEnd,
}: {
  center: { lat: number; lng: number };
  radius: number;
  items: NearbyItem[];
  focusPosition?: { lat: number; lng: number } | null;
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
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level: radiusToLevel(radius),
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
      const initialPosition = new window.kakao.maps.LatLng(center.lat, center.lng);
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

      const handleResize = () => {
        map.relayout();
        map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
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

    clustererRef.current.clear();
    markersRef.current.forEach((marker) => marker.setMap(null));

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

      window.kakao.maps.event.addListener(marker, 'click', () => {
        const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
        const group = groupsByPosition.get(key) ?? [item];
        if (group.length > 1 && onSelectGroup) {
          onSelectGroup(group);
        } else {
          onSelectItem(item);
        }
      });

      return marker;
    });

    markersRef.current = markers;
    clustererRef.current.addMarkers(markers);
    // onSelectItem은 상위에서 안정적으로 전달되지 않을 수 있어 의도적으로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return <div ref={containerRef} className="w-full h-full bg-gray-100" />;
}
