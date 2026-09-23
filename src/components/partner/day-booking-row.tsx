import Link from 'next/link';
import { formatMonthDayWithWeekday } from '@/lib/partner/date';

// [나드리픽 파트너 PMS — 주간 뷰](2026-09-20 사용자 지시, docs/partner_spec.md
// 5절): "각 요일별 영역에 일자 / 금일 예약팀, 시간, 인원 등의 정보들이 1줄씩
// 표기". 상태 변경 등 조작은 이 화면의 몫이 아니다(그건 일간 뷰) — 터치하면
// 통째로 일간 뷰로 점프하므로 순수 표시 전용, 클라이언트 컴포넌트일 필요가
// 없다(Link 하나로 충분 — 제5장 제4조 불필요한 상태 없이 가장 단순하게).
// [주간 뷰를 월간으로 흡수](2026-09-23 사용자 지시): "월간쪽을 주간과
// 같이해줘 한달치에 대하여... 주간처럼" — 독립 주간 탭/페이지는 없어졌지만,
// 이 "하루 한 줄" 행 컴포넌트 자체는 요일 개념과 무관해 그대로 재사용할 수
// 있어(제5장 제4조) `weekly-day-row.tsx`에서 이름만 일반화해 옮겨왔다. 월간
// 뷰의 모바일 리스트가 이 컴포넌트를 그 달의 모든 날짜에 대해 반복 렌더링한다.
export type DayBookingSummary = {
  id: string;
  booking_time: string;
  customer_name: string;
  headcount: number;
  status: string;
};

function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function DayBookingRow({
  date,
  bookings,
  isToday,
}: {
  date: string;
  bookings: DayBookingSummary[];
  isToday: boolean;
}) {
  const totalHeadcount = bookings.reduce((sum, b) => sum + b.headcount, 0);

  return (
    <Link
      href={`/partner/today?date=${date}`}
      className={`block border-b border-gray-100 px-4 py-3 active:bg-gray-50 ${isToday ? 'bg-blue-50' : 'bg-white'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-900">
          {formatMonthDayWithWeekday(date)}
          {isToday && <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">오늘</span>}
        </span>
        {bookings.length > 0 && (
          <span className="text-xs text-gray-400">
            {bookings.length}건 · {totalHeadcount}명
          </span>
        )}
      </div>
      {bookings.length === 0 ? (
        <p className="mt-1 text-sm text-gray-300">예약 없음</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {bookings.map((booking) => (
            <li
              key={booking.id}
              className={`text-sm text-gray-600 ${booking.status === 'cancelled' ? 'text-gray-300 line-through' : ''}`}
            >
              {formatTime(booking.booking_time)} · {booking.customer_name} · {booking.headcount}명
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
