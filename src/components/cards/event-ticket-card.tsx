'use client';

// [이벤트픽 & 티켓 할인 정보 MVP](2026-08-29 사용자 지시): 홈 화면에 그리드로 나열되는
// 축제/체험 프로그램/입장권 할인 카드. deal-card.tsx의 이미지:텍스트 flex-[4]/flex-[6]
// 레이아웃을 재사용하되(제5장 제4조 기존 구조 우선), 이 카드는 행사 기간/장소 정보가
// 있어 그 두 줄을 가격 정보 위에 추가로 보여준다.
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

function formatWon(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function EventTicketCard({
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
      className="h-full text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      <div className="relative flex-[4] bg-gray-100">
        {eventTicket.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={eventTicket.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl bg-indigo-50" aria-hidden>
            🎪
          </div>
        )}
        {eventTicket.category && (
          <span className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
            {eventTicket.category}
          </span>
        )}
        {eventTicket.discount_rate > 0 && (
          <span className="absolute top-2 right-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white">
            {eventTicket.discount_rate}% 할인
          </span>
        )}
      </div>

      <div className="p-3 flex-[6] min-h-0 overflow-hidden flex flex-col gap-1">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">{eventTicket.title}</p>
        {eventTicket.event_period && (
          <p className="text-xs text-gray-400 line-clamp-1">📅 {eventTicket.event_period}</p>
        )}
        {eventTicket.location_name && (
          <p className="text-xs text-gray-400 line-clamp-1">📍 {eventTicket.location_name}</p>
        )}
        <div className="mt-auto flex flex-col gap-0.5">
          <span className="text-xs text-gray-400 line-through">{formatWon(eventTicket.original_price)}</span>
          <span className="text-base font-bold text-rose-600">{formatWon(eventTicket.discount_price)}</span>
        </div>
      </div>
    </button>
  );
}
