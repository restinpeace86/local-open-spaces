'use client';

import { useEffect, useState } from 'react';
import {
  getNearbyParkingLots,
  getNearbyKidsRestaurants,
  type NearbyParkingLot,
  type NearbyItem,
} from '@/lib/spaces/get-nearby';

// [스팟/이벤트 상세 "주변 주차장/식당" 아코디언](2026-10-02 사용자 지시): "키즈친화 식당
// 하고 주변 주차장으로 해서 하나의 스팟/이벤트 장소에 대하여 주변정보로써 제공하려고
// 해... 주차 안내 아래에 자연스럽게 이어서 붙이면, 부모 유저들이 스크롤을 내리면서
// 한눈에 외출 동선을 완벽하게 짤 수 있습니다."
//
// [도보거리 계산 보류](2026-10-02 사용자 지시): "지금은 직선거리 기반 직경거리로
// 해." — Tmap 키가 아직 없어(가입 전) 펼쳤을 때 /api/nearby/walking-distance를
// 호출해 도보 실거리로 교체하던 로직을 걷어내고, 지금은 항상 직선거리만 보여준다.
// 해당 API 라우트/Tmap 클라이언트 자체는 삭제하지 않고 남겨뒀다(키 등록 후 이
// 컴포넌트에서 다시 호출하도록 되돌리면 된다).
//
// [정렬](2026-10-02 사용자 지시): "가까운순서대로 보여주고" — 별도 클라이언트 정렬이
// 필요 없다. getNearbyParkingLots/getNearbyKidsRestaurants가 호출하는 RPC
// (get_nearby_parking_lots, get_nearby_spaces_and_events) 둘 다 SQL에서 이미
// `order by distance_meters`로 정렬해 반환하므로, 받은 배열을 그대로 렌더링하면
// 가까운 순서가 유지된다.
//
// [기본 접힘 상태](2026-10-02 사용자 확인): "처음에 default는 접힌상태야 사용자가
// 펼치기 누르면 펼치는거야" — 이미 `useState(false)`로 기본 접힘이었다(변경 없음,
// 사용자 확인 요청에 대한 재확인).

type OriginInfo = {
  lat: number;
  lng: number;
  originTable: 'open_spaces' | 'events';
  originId: string;
};

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

function DirectionsLink({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  // [기존 관례 재사용] 이 프로젝트는 "외부 지도 앱으로 내보내지 않고 인앱에서 해결"
  // 원칙(2026-08-30 결정)을 상세 모달 자체 길찾기에 적용했지만, 이 카드는 상세 모달이
  // 하나 더 열리는 구조가 아니라 "여기로 가는 길" 자체가 목적이라 카카오맵 앱/웹으로
  // 바로 연결하는 게 자연스럽다 — Tmap 연동 전까지는 정확한 인앱 경로선을 그릴 방법이
  // 없기도 하다(직선거리뿐).
  const url = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      길찾기 ↗
    </a>
  );
}

function ParkingCard({ lot }: { lot: NearbyParkingLot }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 rounded-lg">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">🅿️ {lot.name}</p>
        <p className="text-xs text-gray-500">
          직선 {formatDistance(lot.distance_meters)}
          {lot.is_paid !== null && <> · {lot.is_paid ? '유료' : '무료'}</>}
        </p>
      </div>
      <DirectionsLink lat={lot.lat} lng={lot.lng} name={lot.name} />
    </div>
  );
}

function RestaurantCard({ spot, badges }: { spot: NearbyItem; badges?: string[] }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 rounded-lg">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">🍽️ {spot.name}</p>
        <p className="text-xs text-gray-500">직선 {formatDistance(spot.distance_meters)}</p>
        {badges && badges.length > 0 && (
          <p className="text-xs text-emerald-700 mt-0.5 truncate">🏷️ {badges.join(' · ')}</p>
        )}
      </div>
      <DirectionsLink lat={spot.lat} lng={spot.lng} name={spot.name} />
    </div>
  );
}

function AccordionShell({
  icon,
  label,
  count,
  isOpen,
  onToggle,
  children,
}: {
  icon: string;
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white text-left"
      >
        <span className="text-sm font-semibold text-gray-900">
          {icon} {label} ({count}곳)
        </span>
        <span className="text-xs text-gray-400">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div className="p-2 flex flex-col gap-1.5 bg-gray-50/50 border-t border-gray-100">{children}</div>}
    </div>
  );
}

function ParkingAccordion(origin: OriginInfo) {
  const [lots, setLots] = useState<NearbyParkingLot[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNearbyParkingLots(origin.lng, origin.lat, 500)
      .then((rows) => {
        if (!cancelled) setLots(rows);
      })
      .catch(() => {
        if (!cancelled) setLots([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng]);

  return (
    <AccordionShell
      icon="🅿️"
      label="주변 공영주차장"
      count={lots?.length ?? 0}
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
    >
      {lots?.map((lot) => (
        <ParkingCard key={lot.id} lot={lot} />
      ))}
    </AccordionShell>
  );
}

function RestaurantAccordion(origin: OriginInfo) {
  const [spots, setSpots] = useState<NearbyItem[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [badges, setBadges] = useState<Record<string, { labels: string[] }>>({});

  useEffect(() => {
    let cancelled = false;
    getNearbyKidsRestaurants(origin.lng, origin.lat, 1000)
      .then((rows) => {
        if (cancelled) return;
        setSpots(rows);
        if (rows.length > 0) {
          fetch(`/api/nearby/spot-badges?ids=${rows.map((r) => r.id).join(',')}`)
            .then((res) => res.json())
            .then((data: { badges?: Record<string, { labels: string[] }> }) => {
              if (!cancelled) setBadges(data.badges ?? {});
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setSpots([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng]);

  return (
    <AccordionShell
      icon="🍽️"
      label="주변 키즈친화 식당"
      count={spots?.length ?? 0}
      isOpen={isOpen}
      onToggle={() => setIsOpen((v) => !v)}
    >
      {spots?.map((spot) => (
        <RestaurantCard key={spot.id} spot={spot} badges={badges[spot.id]?.labels} />
      ))}
    </AccordionShell>
  );
}

export function NearbyAmenitiesSection(origin: OriginInfo) {
  return (
    <div className="flex flex-col gap-2">
      <ParkingAccordion {...origin} />
      <RestaurantAccordion {...origin} />
    </div>
  );
}
