'use client';

// [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시): "이번 주말 실패
// 없는 베스트 나들이 픽" 가로 슬라이드 섹션. 직전에 만들었던 "🔥 이번 주말 놓치면
// 후회할 특가" 그리드 배너 섹션(event-ticket-banner-card.tsx, 이번 작업으로 삭제)과
// 거의 동일한 목적(event_tickets 큐레이션, 제휴 링크 연결)이라 사용자 확인 후 그 자리를
// 대체한다 — "광고 느낌을 지우고 신뢰감 있는 큐레이션" 컨셉이라 할인율 뱃지 등 세일즈성
// 장식은 넣지 않고 썸네일/타이틀/장소만 담백하게 보여준다. 카드를 누르면 상세 모달 없이
// 곧바로 booking_url을 새 창으로 연다(요구사항 5 원문 — 중간 단계 없음).
export type EventTicket = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  event_period: string | null;
  location_name: string | null;
  original_price: number;
  discount_price: number;
  discount_rate: number;
  image_url: string | null;
  booking_url: string;
  is_active: boolean;
  created_at: string;
};

export function BestPickSlider({ items }: { items: EventTicket[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.booking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 w-36 snap-start [scroll-snap-stop:always] rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
        >
          <div className="relative aspect-square bg-gray-100">
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl bg-gray-50" aria-hidden>
                🧭
              </div>
            )}
          </div>
          <div className="p-2.5">
            <p className="text-xs font-medium text-gray-900 line-clamp-2 min-h-[2rem]">{item.title}</p>
            {item.location_name && (
              <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{item.location_name}</p>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}

const SKELETON_COUNT = 4;

export function BestPickSliderSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1" role="status" aria-label="베스트 나들이 픽 불러오는 중">
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <div
          key={i}
          className="shrink-0 w-36 h-[172px] rounded-2xl border border-gray-200 bg-gray-100 animate-pulse"
          aria-hidden
        />
      ))}
    </div>
  );
}
