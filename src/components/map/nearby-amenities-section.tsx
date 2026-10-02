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
// 한눈에 외출 동선을 완벽하게 짤 수 있습니다." 2단계 전략(사용자 지시 그대로):
// 1) 접힌 상태 — 직선거리 반경(주차장 500m/식당 1km) DB 조회로 "N곳"만 즉시 표시
//    (API 호출 비용 없음, Supabase RPC만 사용).
// 2) 펼친 상태 — 그제서야 /api/nearby/walking-distance를 배치 호출해 도보 실거리/
//    시간을 계산한다(Tmap 하루 1,000건 무료 한도를 아끼기 위해 접힌 상태에서는 호출
//    안 함 — 캐시 우선이라 같은 쌍은 사이트 전체에서 한 번만 계산됨).

type WalkingInfo = { distanceMeters: number; durationSeconds: number; isEstimate: boolean };

type OriginInfo = {
  lat: number;
  lng: number;
  originTable: 'open_spaces' | 'events';
  originId: string;
};

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

function formatWalkingMinutes(seconds: number): string {
  return `도보 ${Math.max(1, Math.round(seconds / 60))}분`;
}

async function fetchWalkingDistances(
  origin: OriginInfo,
  targetTable: 'seoul_public_parking_lots' | 'open_spaces',
  targets: { id: string; lat: number; lng: number }[]
): Promise<Record<string, WalkingInfo>> {
  const res = await fetch('/api/nearby/walking-distance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originTable: origin.originTable,
      originId: origin.originId,
      originLat: origin.lat,
      originLng: origin.lng,
      targets: targets.map((t) => ({ targetTable, targetId: t.id, lat: t.lat, lng: t.lng })),
    }),
  });
  if (!res.ok) throw new Error('도보 거리 계산에 실패했습니다.');
  const data: { results?: { targetId: string; distanceMeters: number; durationSeconds: number; isEstimate: boolean }[] } =
    await res.json();
  const map: Record<string, WalkingInfo> = {};
  for (const r of data.results ?? []) {
    map[r.targetId] = { distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds, isEstimate: r.isEstimate };
  }
  return map;
}

function DirectionsLink({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  // [기존 관례 재사용] 이 프로젝트는 "외부 지도 앱으로 내보내지 않고 인앱에서 해결"
  // 원칙(2026-08-30 결정)을 상세 모달 자체 길찾기에 적용했지만, 이 카드는 상세 모달이
  // 하나 더 열리는 구조가 아니라 "여기로 가는 길" 자체가 목적이라 카카오맵 앱/웹으로
  // 바로 연결하는 게 자연스럽다 — Tmap 연동 전까지는 정확한 인앱 경로선을 그릴 방법이
  // 없기도 하다(직선거리 추정뿐).
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

function ParkingCard({ lot, walking }: { lot: NearbyParkingLot; walking?: WalkingInfo }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 rounded-lg">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">🅿️ {lot.name}</p>
        <p className="text-xs text-gray-500">
          {walking ? (
            <>
              {formatDistance(walking.distanceMeters)} · {formatWalkingMinutes(walking.durationSeconds)}
              {walking.isEstimate && ' (추정)'}
            </>
          ) : (
            `직선 ${formatDistance(lot.distance_meters)}`
          )}
          {lot.is_paid !== null && <> · {lot.is_paid ? '유료' : '무료'}</>}
        </p>
      </div>
      <DirectionsLink lat={lot.lat} lng={lot.lng} name={lot.name} />
    </div>
  );
}

function RestaurantCard({ spot, walking, badges }: { spot: NearbyItem; walking?: WalkingInfo; badges?: string[] }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 rounded-lg">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">🍽️ {spot.name}</p>
        <p className="text-xs text-gray-500">
          {walking ? (
            <>
              {formatDistance(walking.distanceMeters)} · {formatWalkingMinutes(walking.durationSeconds)}
              {walking.isEstimate && ' (추정)'}
            </>
          ) : (
            `직선 ${formatDistance(spot.distance_meters)}`
          )}
        </p>
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
  const [walking, setWalking] = useState<Record<string, WalkingInfo>>({});
  const [isLoadingWalking, setIsLoadingWalking] = useState(false);

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

  function handleToggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && lots && lots.length > 0 && Object.keys(walking).length === 0) {
      setIsLoadingWalking(true);
      fetchWalkingDistances(
        origin,
        'seoul_public_parking_lots',
        lots.map((l) => ({ id: String(l.id), lat: l.lat, lng: l.lng }))
      )
        .then(setWalking)
        .catch(() => {})
        .finally(() => setIsLoadingWalking(false));
    }
  }

  return (
    <AccordionShell icon="🅿️" label="주변 공영주차장" count={lots?.length ?? 0} isOpen={isOpen} onToggle={handleToggle}>
      {isLoadingWalking && <p className="text-xs text-gray-400 px-1 py-1">도보 거리 계산 중...</p>}
      {lots?.map((lot) => (
        <ParkingCard key={lot.id} lot={lot} walking={walking[String(lot.id)]} />
      ))}
    </AccordionShell>
  );
}

function RestaurantAccordion(origin: OriginInfo) {
  const [spots, setSpots] = useState<NearbyItem[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [walking, setWalking] = useState<Record<string, WalkingInfo>>({});
  const [isLoadingWalking, setIsLoadingWalking] = useState(false);
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

  function handleToggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && spots && spots.length > 0 && Object.keys(walking).length === 0) {
      setIsLoadingWalking(true);
      fetchWalkingDistances(
        origin,
        'open_spaces',
        spots.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng }))
      )
        .then(setWalking)
        .catch(() => {})
        .finally(() => setIsLoadingWalking(false));
    }
  }

  return (
    <AccordionShell
      icon="🍽️"
      label="주변 키즈친화 식당"
      count={spots?.length ?? 0}
      isOpen={isOpen}
      onToggle={handleToggle}
    >
      {isLoadingWalking && <p className="text-xs text-gray-400 px-1 py-1">도보 거리 계산 중...</p>}
      {spots?.map((spot) => (
        <RestaurantCard key={spot.id} spot={spot} walking={walking[spot.id]} badges={badges[spot.id]?.labels} />
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
