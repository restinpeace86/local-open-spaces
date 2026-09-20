import { createClient } from '@/lib/supabase/server';
import { getFirstDayOfMonth, getLastDayOfMonth, todayKstDateString } from '@/lib/partner/date';
import { aggregateBookingsByDay } from '@/lib/partner/aggregate-bookings';
import { MonthlyNav } from '@/components/partner/monthly-nav';
import { MonthSummary } from '@/components/partner/month-summary';
import { MonthCalendarGrid } from '@/components/partner/month-calendar-grid';

// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "월 전체를 조망할 수 있는 캘린더 그리드 뷰". today/weekly와 동일한 관례(searchParams
// Promise, RLS에 위임한 세션 클라이언트 조회). 집계(일자별 건수/인원, 월 총합계)는
// DB에 GROUP BY를 맡기지 않고 이 함수 안에서 JS로 계산한다 — 이 프로젝트가 이미
// 여러 곳에서 쓰는 관례(get-home-feed.ts 등)이고, 한 파트너의 한 달 예약 건수는
// 집계 쿼리를 따로 만들 만큼 크지 않다.
export default async function PartnerMonthlyPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: rawDate } = await searchParams;
  const todayDate = todayKstDateString();
  const anchorDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDate;
  const monthStart = getFirstDayOfMonth(anchorDate);
  const monthEnd = getLastDayOfMonth(anchorDate);

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from('bookings')
    .select('booking_date, headcount')
    .gte('booking_date', monthStart)
    .lte('booking_date', monthEnd);

  const { countByDay, totalCount, totalHeadcount } = aggregateBookingsByDay(bookings ?? []);

  return (
    <div className="flex flex-col">
      <MonthlyNav monthAnchor={monthStart} todayDate={todayDate} />
      <MonthSummary totalCount={totalCount} totalHeadcount={totalHeadcount} />
      <MonthCalendarGrid monthStart={monthStart} monthEnd={monthEnd} countByDay={countByDay} todayDate={todayDate} />
    </div>
  );
}
