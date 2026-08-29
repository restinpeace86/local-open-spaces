'use client';

import { EventTicket } from '@/components/cards/event-ticket-card';

// [이벤트픽 & 티켓 할인 정보 MVP](2026-08-29 사용자 지시) 요구사항 3: 카드 터치 시 열리는
// 상세 모달 — 이벤트 소개, 행사 기간/장소, 가격 정보를 보여준 뒤 [할인 티켓 예매하기]
// 버튼으로 예매처(booking_url)를 새 창으로 연다. deal-detail-modal.tsx와 배경 클릭/X 버튼
// 닫힘 등 바텀시트 관례는 동일하되, 이 지시서는 deals와 달리 제휴 마케팅 안내 문구를
// 요구하지 않아(요구사항 3 원문에 없음) 추가하지 않았다(제3장 제2조 Spec 우선).
function formatWon(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function EventTicketDetailModal({
  eventTicket,
  onClose,
}: {
  eventTicket: EventTicket;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[420px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[16/9] bg-gray-100">
          {eventTicket.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={eventTicket.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl bg-indigo-50" aria-hidden>
              🎪
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {eventTicket.category && (
            <span className="self-start text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
              {eventTicket.category}
            </span>
          )}
          <h2 className="text-lg font-bold text-gray-900">{eventTicket.title}</h2>
          {eventTicket.description && (
            <p className="text-sm text-gray-600 whitespace-pre-line">{eventTicket.description}</p>
          )}

          <div className="flex flex-col gap-1 text-sm text-gray-500">
            {eventTicket.event_period && <p>📅 {eventTicket.event_period}</p>}
            {eventTicket.location_name && <p>📍 {eventTicket.location_name}</p>}
          </div>

          <div className="flex items-center gap-2">
            {eventTicket.discount_rate > 0 && (
              <span className="text-base font-bold text-rose-600">{eventTicket.discount_rate}%</span>
            )}
            <span className="text-xl font-bold text-gray-900">{formatWon(eventTicket.discount_price)}</span>
            <span className="text-sm text-gray-400 line-through">{formatWon(eventTicket.original_price)}</span>
          </div>

          <a
            href={eventTicket.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 rounded-lg bg-indigo-600 text-white text-sm font-semibold py-3 text-center"
          >
            🎟️ 할인 티켓 예매하기
          </a>
        </div>
      </div>
    </div>
  );
}
