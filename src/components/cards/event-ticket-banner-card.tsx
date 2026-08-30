'use client';

import { EventTicket } from '@/components/cards/event-ticket-card';

// [홈 화면 할인 티켓(event_tickets) 섹션 UI 개편](2026-08-29 사용자 지시): 홈 상단 "🔥 이번
// 주말 놓치면 후회할 특가" 섹션 전용 Hero 스타일 배너 카드. 사용자가 정확한 클래스 스펙을
// 지정해(h-[320px]/bg-gray-900/bg-gradient-to-t 등) 그대로 반영했다. 전체보기 바텀시트
// (event-ticket-browse-sheet.tsx)에서는 공간 효율이 더 중요해 기존 그리드형
// EventTicketCard를 그대로 쓰고, 이 배너 카드는 홈 상단 4개 스포트라이트 전용으로 분리했다.
// 카드 전체가 하나의 <button>이라 카드 클릭/"예매하기" 표시 버튼 클릭 모두 동일하게
// onSelect를 호출한다(지시서 "기존처럼... 유지" — 실제 booking_url 새 창 열기는 기존과
// 동일하게 상세 모달(EventTicketDetailModal) 안의 버튼이 담당한다).
function formatWon(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function EventTicketBannerCard({
  eventTicket,
  onSelect,
}: {
  eventTicket: EventTicket;
  onSelect: (eventTicket: EventTicket) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(eventTicket)}
      className="relative overflow-hidden rounded-2xl shadow-md h-[320px] flex flex-col justify-end bg-gray-900 text-left"
    >
      {eventTicket.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={eventTicket.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-5xl" aria-hidden>
          🎪
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      {eventTicket.discount_rate > 0 && (
        <span className="absolute top-3 left-3 z-10 text-xs font-bold px-2.5 py-1 rounded-full bg-red-600 text-white">
          {eventTicket.discount_rate}% 할인특가
        </span>
      )}

      <div className="relative z-10 p-4 flex flex-col gap-1">
        {eventTicket.location_name && (
          <p className="text-xs text-white/70 line-clamp-1">📍 {eventTicket.location_name}</p>
        )}
        <p className="text-base font-bold text-white line-clamp-2">{eventTicket.title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-white/60 line-through">{formatWon(eventTicket.original_price)}</span>
          <span className="text-lg font-extrabold text-white">{formatWon(eventTicket.discount_price)}</span>
        </div>
        <span className="mt-1 self-start inline-flex items-center gap-0.5 rounded-full bg-white text-gray-900 text-xs font-semibold px-3 py-1.5">
          예매하기 ›
        </span>
      </div>
    </button>
  );
}
