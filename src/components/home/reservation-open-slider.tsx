'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { EventCard } from '@/components/cards/event-card';

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "당일 예약 필요 카드 구역"): "당일
// 기준 현재 예약 접수가 가능한(SVCSTATNM == '접수중') 이벤트/행사/클래스" 가로 스크롤 슬라이더.
// Hero Carousel과 달리 Auto-play/CTA 슬라이드가 없는 단순 가로 스크롤이라 EventCard(그리드
// 카드)를 그대로 재사용한다(제5장 제4조 기존 구조 우선 — 새 카드 UI를 만들지 않음).
export function ReservationOpenSlider({
  items,
  onSelect,
}: {
  items: NearbyItem[];
  onSelect: (item: NearbyItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory">
      {items.map((item) => (
        <div key={item.id} className="shrink-0 w-40 snap-start [scroll-snap-stop:always]">
          <EventCard item={item} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
