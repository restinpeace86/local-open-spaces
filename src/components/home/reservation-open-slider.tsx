'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { EventCard } from '@/components/cards/event-card';

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "당일 예약 필요 카드 구역"): "당일
// 기준 현재 예약 접수가 가능한(SVCSTATNM == '접수중') 이벤트/행사/클래스" 가로 스크롤 슬라이더.
// Hero Carousel과 달리 Auto-play/CTA 슬라이드가 없는 단순 가로 스크롤이라 EventCard(그리드
// 카드)를 그대로 재사용한다(제5장 제4조 기존 구조 우선 — 새 카드 UI를 만들지 않음).
// [이벤트픽 화면 개편](2026-08-27)부터 "현재 이용 가능" 섹션도 이 컴포넌트를 재사용한다.
// [카드 뱃지 문구 정리](2026-08-27 사용자 지시): 이 컴포넌트의 두 소비처("현재 이용 가능"/
// "예약 가능") 모두에서 키즈/어린이 뱃지를 뺀다 — 이미 타겟 연령 필터(4종)로 좁혀진 화면이라
// 뱃지로 다시 강조할 필요가 적다는 지적.
// [이벤트 카드 텍스트 영역 뱃지 정리](2026-09-04 사용자 지시): 키즈/어린이 뱃지를 EventCard
// 전역(parental-badges.ts)에서 아예 없앴으므로, 여기서만 특별히 숨기던 hideBadgeKeys={['kids']}
// 지정은 더 이상 필요 없다 — 제거.
// [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시): 카드마다 뱃지/타이틀 줄바꿈 유무가 달라 높이가
// 제각각이던 문제 — 래퍼에 고정 높이를 주면 EventCard의 h-full이 그 높이를 그대로
// 채워 폭(w-40)·높이 모두 고정된 동일 규격 카드가 된다.
// [카드 세로 높이 축소](2026-09-03 사용자 지시): "뱃지를 이미지 쪽으로 옮겼으면 카드
// 높이도 줄여라 — 지금 여백이 너무 많다"는 후속 지시. 무료/유료·실내야외 뱃지가
// 이미지 오버레이로 옮겨가면서(직전 작업) 텍스트 영역(flex-[6])에 남은 내용(제목 2줄+
// 장소+기간+최대 2개 뱃지)이 기존 h-64(256px)가 확보해주던 공간보다 확연히 적어져
// 하단에 빈 여백이 생겼다 — h-56(224px)으로 줄여 이미지:텍스트 4:6 비율은 그대로
// 유지한 채(비율 자체는 event-card.test.tsx가 고정 검증하는 값이라 건드리지 않음)
// 전체 카드 높이만 32px 줄인다.
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
        <div key={item.id} className="shrink-0 w-40 h-56 snap-start [scroll-snap-stop:always]">
          <EventCard item={item} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}

// [홈 화면 성능 최적화](2026-08-29 사용자 지시): "현재 이용 가능"/"예약 가능" 데이터가 더
// 이상 SSR로 오지 않고 마운트 후 클라이언트에서 지연 페칭되므로, 그동안 보여줄 스켈레톤이
// 필요하다. 실제 카드와 동일한 규격(w-40 h-56)을 맞춰 데이터 도착 시 Layout Shift(CLS)가
// 생기지 않게 한다(free-feed-skeleton.tsx와 동일한 목적, 가로 슬라이더 형태만 다름).
const SLIDER_SKELETON_COUNT = 4;

export function ReservationOpenSliderSkeleton({ label }: { label: string }) {
  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1" role="status" aria-label={label}>
      {Array.from({ length: SLIDER_SKELETON_COUNT }, (_, i) => (
        <div
          key={i}
          className="shrink-0 w-40 h-56 rounded-2xl border border-gray-200 bg-gray-100 animate-pulse"
          aria-hidden
        />
      ))}
    </div>
  );
}
