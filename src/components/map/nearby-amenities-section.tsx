'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getNearbyParkingLots,
  getNearbyKidsRestaurants,
  getMatchedParkingLot,
  getSpotParkingId,
  type NearbyParkingLot,
  type MatchedParkingLot,
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
  name: string;
  originTable: 'open_spaces' | 'events';
  originId: string;
};

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

// [길찾기 출발지/이동수단 버그 수정](2026-10-02 사용자 지시): "길찾기하면... 출발지가
// 현재위치기준으로 잡혀있네... 지금 현재위치기준이 아니고 우리가 가는 이벤트 스팟..
// 목적지가 출발지가 되어야하고 그 주변식당이 도착지가 되어야하지. 그리고... default가
// 차로 되어있는데 도보 선택해줄수있어?" — 기존 `/link/to/...`는 출발지를 지정할 방법이
// 없어 앱이 항상 사용자의 실시간 GPS 위치를 출발지로 잡는다(이게 버그의 원인이었다).
// 카카오맵 공식 URL 스킴 문서(apis.map.kakao.com/web/guide) 확인 결과 출발지·도착지·
// 이동수단을 모두 지정하는 전용 형식이 있다: `/link/by/{car|walk|bicycle|traffic}/
// {출발지명},{위도},{경도}/{도착지명},{위도},{경도}`. 이걸로 출발지=현재 보고 있는
// 스팟/이벤트, 도착지=주차장/식당, 이동수단=도보(walk)로 명시한다.
function DirectionsLink({
  origin,
  destination,
}: {
  origin: { lat: number; lng: number; name: string };
  destination: { lat: number; lng: number; name: string };
}) {
  // [기존 관례 재사용] 이 프로젝트는 "외부 지도 앱으로 내보내지 않고 인앱에서 해결"
  // 원칙(2026-08-30 결정)을 상세 모달 자체 길찾기에 적용했지만, 이 카드는 상세 모달이
  // 하나 더 열리는 구조가 아니라 "여기로 가는 길" 자체가 목적이라 카카오맵 앱/웹으로
  // 바로 연결하는 게 자연스럽다 — Tmap 연동 전까지는 정확한 인앱 경로선을 그릴 방법이
  // 없기도 하다(직선거리뿐).
  const url = `https://map.kakao.com/link/by/walk/${encodeURIComponent(origin.name)},${origin.lat},${origin.lng}/${encodeURIComponent(destination.name)},${destination.lat},${destination.lng}`;
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

// [요금/결제/특기사항 상세](2026-10-15, todo.md 개선사항1): "너무 UI가
// 지저분해질거같으면 주차장 뱃지를 누르면 해당 정보확인할수 있게" — 카드를 눌러야
// 요금/결제방법/특기사항/데이터기준일자가 펼쳐지는 접었다펴기 구조로, 목록 화면
// 자체는 이름·거리·요금유형 한 줄만 보여 깔끔하게 유지한다.
function ParkingDetailLines({ lot }: { lot: Pick<NearbyParkingLot, 'base_minutes' | 'base_fee' | 'extra_unit_minutes' | 'extra_unit_fee' | 'day_pass_fee' | 'monthly_fee' | 'payment_methods' | 'notes' | 'has_disabled_parking' | 'data_reference_date' | 'is_multi_child_discount' | 'discount_info' | 'realtime_available_count' | 'capacity'> }) {
  return (
    <div className="mt-1.5 pt-1.5 border-t border-gray-200 flex flex-col gap-0.5 text-xs text-gray-600">
      {lot.capacity !== null && <p>주차면수 {lot.capacity}면</p>}
      {lot.base_minutes !== null && lot.base_fee !== null && (
        <p>
          기본 {lot.base_minutes}분 {lot.base_fee.toLocaleString()}원
          {lot.extra_unit_minutes !== null && lot.extra_unit_fee !== null && (
            <> · 추가 {lot.extra_unit_minutes}분당 {lot.extra_unit_fee.toLocaleString()}원</>
          )}
        </p>
      )}
      {lot.day_pass_fee !== null && <p>1일 주차권 {lot.day_pass_fee.toLocaleString()}원</p>}
      {lot.monthly_fee !== null && <p>월정기권 {lot.monthly_fee.toLocaleString()}원</p>}
      {lot.payment_methods && <p>결제방법 {lot.payment_methods}</p>}
      {lot.has_disabled_parking && <p>장애인 전용 주차구역 있음</p>}
      {lot.realtime_available_count !== null && (
        <p className="font-semibold text-emerald-700">실시간 주차가능 {lot.realtime_available_count}면</p>
      )}
      {lot.is_multi_child_discount && (
        <p className="text-emerald-700 font-semibold">
          🟢 다자녀 할인 {lot.discount_info ? `· ${lot.discount_info}` : ''}
        </p>
      )}
      {lot.notes && <p className="text-gray-500">{lot.notes}</p>}
      {lot.data_reference_date && <p className="text-gray-400">데이터 기준일 {lot.data_reference_date}</p>}
    </div>
  );
}

function ParkingCard({ lot, origin }: { lot: NearbyParkingLot; origin: OriginInfo }) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="py-2 px-3 bg-gray-50 rounded-lg">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">🅿️ {lot.name}</p>
          <p className="text-xs text-gray-500">
            직선거리 {formatDistance(lot.distance_meters)}
            {lot.fee_type && <> · {lot.fee_type}</>}
            {lot.is_multi_child_discount && <span className="ml-1 text-emerald-700">🟢 다자녀 할인</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <DirectionsLink origin={origin} destination={lot} />
          <span className="text-xs text-gray-400">{isExpanded ? '간략히' : '상세보기'}</span>
        </div>
      </button>
      {isExpanded && <ParkingDetailLines lot={lot} />}
    </div>
  );
}

// [부설(건물 전용) 주차장 1:1 매칭 카드](2026-10-15, todo.md 개선사항1): "스팟 테이블에
// parking_id (FK)를 연결하여 상세 페이지에 주차장 뱃지를 달아주며... 주차정보의
// 정보확인이 가능하도록". 반경검색이 아니라 이 스팟 자신의 주차장이라 거리 표시가
// 없고, 항상 접힌 상태로 시작한다(아코디언이 아니라 단일 카드).
export function MatchedParkingCard({ parkingId, origin }: { parkingId: string; origin: OriginInfo }) {
  const [lot, setLot] = useState<MatchedParkingLot | null | undefined>(undefined);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMatchedParkingLot(parkingId)
      .then((result) => {
        if (!cancelled) setLot(result);
      })
      .catch(() => {
        if (!cancelled) setLot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [parkingId]);

  if (!lot) return null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">🅿️ 전용 주차장 — {lot.name}</p>
          <p className="text-xs text-gray-500">
            {lot.fee_type ?? ''}
            {lot.is_multi_child_discount && <span className="ml-1 text-emerald-700">🟢 다자녀 할인</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <DirectionsLink origin={origin} destination={lot} />
          <span className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {isExpanded && (
        <div className="p-3 bg-gray-50/50 border-t border-gray-100">
          <ParkingDetailLines lot={lot} />
        </div>
      )}
    </div>
  );
}

function RestaurantCard({ spot, origin, badges }: { spot: NearbyItem; origin: OriginInfo; badges?: string[] }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 rounded-lg">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">🍽️ {spot.name}</p>
        <p className="text-xs text-gray-500">직선거리 {formatDistance(spot.distance_meters)}</p>
        {badges && badges.length > 0 && (
          <p className="text-xs text-emerald-700 mt-0.5 truncate">🏷️ {badges.join(' · ')}</p>
        )}
      </div>
      <DirectionsLink origin={origin} destination={spot} />
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
  // [펼침 스크롤 포커스 버그 수정](2026-10-02 사용자 지시): "펼치기 했을때 포커스가
  // 이게 아닌거 같아.. 9곳펼쳐도 아래쪽으로 열리고 이걸 밑에서부터 끌어올려야돼" —
  // 카드 목록이 토글 버튼 아래로 펼쳐지면서 상세 모달의 스크롤 영역 기준으로는
  // 화면 밖에 남아, 유저가 직접 아래로 스크롤해야만 보였다. 펼칠 때 이 아코디언의
  // 토글 버튼을 스크롤 가능한 조상 기준으로 상단에 맞춰 자동으로 끌어올린다.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isOpen) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isOpen]);

  if (count === 0) return null;
  return (
    <div ref={containerRef} className="border border-gray-200 rounded-xl overflow-hidden">
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
        <ParkingCard key={lot.id} lot={lot} origin={origin} />
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
        <RestaurantCard key={spot.id} spot={spot} origin={origin} badges={badges[spot.id]?.labels} />
      ))}
    </AccordionShell>
  );
}

// [부설 매칭 조회 + 카드 렌더링을 한 번에](2026-10-15, todo.md 개선사항1) 호출부
// (detail-modal.tsx)가 parking_id 유무를 직접 신경 쓰지 않도록, 조회부터 렌더링까지
// 이 컴포넌트 안에서 처리한다 — 매칭이 없으면 아무것도 그리지 않는다.
export function SpotParkingBadge({ spotId, origin }: { spotId: string; origin: OriginInfo }) {
  const [parkingId, setParkingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSpotParkingId(spotId)
      .then((id) => {
        if (!cancelled) setParkingId(id);
      })
      .catch(() => {
        if (!cancelled) setParkingId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  if (!parkingId) return null;
  return <MatchedParkingCard parkingId={parkingId} origin={origin} />;
}

export function NearbyAmenitiesSection(origin: OriginInfo) {
  return (
    <div className="flex flex-col gap-2">
      <ParkingAccordion {...origin} />
      <RestaurantAccordion {...origin} />
    </div>
  );
}
