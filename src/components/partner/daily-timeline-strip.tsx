'use client';

const HOUR_IN_MINUTES = 60;
const MIN_SPAN_MINUTES = 3 * HOUR_IN_MINUTES;
const PX_PER_HOUR = 70;

function timeToMinutes(time: string): number {
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

function formatHourLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}시`;
}

export type TimelineBooking = {
  id: string;
  booking_time: string;
  customer_name: string;
  headcount: number;
  status: string;
};

// [나드리픽 파트너 PMS — 일간 뷰 타임라인](2026-09-25 사용자 지시): "일자별
// 장부보는데선 오늘 건수들에 대하여 타임라인으로 보여지나? 단순히 리스트로
// 보여지면 뭔가 매력이 부족" → "기존 기능 안버리면서 한눈에 보는 느낌... 사용자
// 경험을 최대한 편하게". 기존 BookingCard 리스트는 그대로 두고(제5장 제2조 임의
// UI 변경 금지 — 리스트를 대체하지 않고 추가만 한다), 그 위에 오늘 예약들을
// 시간순으로 한눈에 훑어볼 수 있는 가로 스크롤 스트립을 얹는다. 점을 탭하면
// 해당 BookingCard로 스크롤 이동한다.
const STATUS_DOT_CLASS: Record<string, string> = {
  confirmed: 'bg-blue-600',
  completed: 'bg-gray-400',
  noshow: 'bg-orange-500',
  cancelled: 'bg-gray-300',
};

export function DailyTimelineStrip({ bookings }: { bookings: TimelineBooking[] }) {
  if (bookings.length === 0) return null;

  const minutesList = bookings.map((b) => timeToMinutes(b.booking_time));
  const rangeStart = Math.max(0, Math.min(...minutesList) - HOUR_IN_MINUTES);
  const rangeEndRaw = Math.max(...minutesList) + HOUR_IN_MINUTES;
  const rangeEnd = Math.min(24 * 60, Math.max(rangeEndRaw, rangeStart + MIN_SPAN_MINUTES));
  const span = rangeEnd - rangeStart;

  const hourMarks: number[] = [];
  for (let m = Math.ceil(rangeStart / HOUR_IN_MINUTES) * HOUR_IN_MINUTES; m <= rangeEnd; m += HOUR_IN_MINUTES) {
    hourMarks.push(m);
  }

  function scrollToCard(id: string) {
    document.getElementById(`booking-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="border-b border-gray-100 bg-white px-4 py-3">
      <div className="overflow-x-auto">
        <div className="relative h-14" style={{ minWidth: `${Math.max(320, (span / HOUR_IN_MINUTES) * PX_PER_HOUR)}px` }}>
          <div className="absolute inset-x-0 top-6 h-px bg-gray-200" />
          {hourMarks.map((m) => (
            <span
              key={m}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] text-gray-400"
              style={{ left: `${((m - rangeStart) / span) * 100}%` }}
            >
              {formatHourLabel(m)}
            </span>
          ))}
          {bookings.map((booking) => {
            const left = ((timeToMinutes(booking.booking_time) - rangeStart) / span) * 100;
            const dotClass = STATUS_DOT_CLASS[booking.status] ?? 'bg-gray-400';
            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => scrollToCard(booking.id)}
                aria-label={`${booking.booking_time.slice(0, 5)} ${booking.customer_name} 예약으로 이동`}
                className="absolute top-7 flex -translate-x-1/2 flex-col items-center gap-0.5"
                style={{ left: `${left}%` }}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                <span className="whitespace-nowrap text-[10px] font-medium text-gray-600">{booking.booking_time.slice(0, 5)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
