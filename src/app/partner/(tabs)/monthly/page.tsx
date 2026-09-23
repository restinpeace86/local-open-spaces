import { createClient } from '@/lib/supabase/server';
import { addDaysToDateStr, getFirstDayOfMonth, getLastDayOfMonth, todayKstDateString } from '@/lib/partner/date';
import { aggregateBookingsByDay, groupBookingsByDay } from '@/lib/partner/aggregate-bookings';
import { MonthlyNav } from '@/components/partner/monthly-nav';
import { MonthSummary } from '@/components/partner/month-summary';
import { MonthCalendarGrid } from '@/components/partner/month-calendar-grid';
import { DayBookingRow, DayBookingSummary } from '@/components/partner/day-booking-row';

// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "월 전체를 조망할 수 있는 캘린더 그리드 뷰". today/weekly와 동일한 관례(searchParams
// Promise, RLS에 위임한 세션 클라이언트 조회). 집계(일자별 건수/인원, 월 총합계)는
// DB에 GROUP BY를 맡기지 않고 이 함수 안에서 JS로 계산한다 — 이 프로젝트가 이미
// 여러 곳에서 쓰는 관례(get-home-feed.ts 등)이고, 한 파트너의 한 달 예약 건수는
// 집계 쿼리를 따로 만들 만큼 크지 않다.
//
// [주간 뷰를 월간으로 흡수 + PC/모바일 반응형 분기](2026-09-23 사용자 지시): "월간쪽을
// 주간과 같이해줘 한달치에 대하여... 주간처럼 다만 반응형으로 해서 pc에서는 일반달력
// 처럼 보이게 하고 모바일에선 현재 리스트형태로 보여줄수 있어?" — 독립 탭이었던 주간
// 뷰(요일별 1줄 리스트)를 없애고, 그 표시 방식을 월간 뷰의 "모바일 전용" 레이아웃으로
// 흡수했다. 캘린더 그리드(MonthCalendarGrid)는 그대로 두고 PC 폭(md 이상)에서만
// 보여주며, 모바일에서는 그 달의 모든 날짜를 DayBookingRow(구 WeeklyDayRow, 요일
// 개념과 무관해 이름만 일반화해 재사용)로 하나씩 나열한다. 두 레이아웃 모두 같은
// 서버 컴포넌트가 한 번의 쿼리 결과로 렌더링하고, 실제 노출 여부는 CSS
// `hidden md:block`/`md:hidden`으로만 전환한다 — 기기 판별을 위한 별도 클라이언트
// 상태나 User-Agent 분기 없이 뷰포트 폭만으로 반응한다(제5장 제4조 — 가장 단순한
// 방법).
export default async function PartnerMonthlyPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: rawDate } = await searchParams;
  const todayDate = todayKstDateString();
  const anchorDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDate;
  const monthStart = getFirstDayOfMonth(anchorDate);
  const monthEnd = getLastDayOfMonth(anchorDate);

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_date, booking_time, customer_name, headcount, status')
    .gte('booking_date', monthStart)
    .lte('booking_date', monthEnd)
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true });

  const { countByDay, totalCount, totalHeadcount } = aggregateBookingsByDay(bookings ?? []);

  const daysInMonth = Number(monthEnd.slice(8, 10));
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => addDaysToDateStr(monthStart, i));
  const bookingsByDay = groupBookingsByDay<DayBookingSummary & { booking_date: string }>(bookings ?? [], monthDays);

  return (
    <div className="flex flex-col">
      <MonthlyNav monthAnchor={monthStart} todayDate={todayDate} />
      <MonthSummary totalCount={totalCount} totalHeadcount={totalHeadcount} />

      <div className="hidden md:block">
        <MonthCalendarGrid monthStart={monthStart} monthEnd={monthEnd} countByDay={countByDay} todayDate={todayDate} />
      </div>
      <div className="md:hidden">
        {monthDays.map((date) => (
          <DayBookingRow key={date} date={date} bookings={bookingsByDay.get(date) ?? []} isToday={date === todayDate} />
        ))}
      </div>
    </div>
  );
}
