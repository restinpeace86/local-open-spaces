import { createClient } from '@/lib/supabase/server';
import { addDaysToDateStr, getMondayOfWeek, todayKstDateString } from '@/lib/partner/date';
import { groupBookingsByDay } from '@/lib/partner/aggregate-bookings';
import { WeeklyNav } from '@/components/partner/weekly-nav';
import { WeeklyDayRow, WeeklyBookingSummary } from '@/components/partner/weekly-day-row';

// [나드리픽 파트너 PMS — 주간 뷰](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "현재 주간(7일간)의 예약 리스트를 날짜별로 그룹화하여 요약 표시". today/page.tsx와
// 동일한 관례(searchParams Promise, RLS에 위임한 세션 클라이언트 조회, 형식이 안
// 맞는 date는 오늘로 안전 폴백).
export default async function PartnerWeeklyPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: rawDate } = await searchParams;
  const todayDate = todayKstDateString();
  const anchorDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDate;
  const monday = getMondayOfWeek(anchorDate);
  const sunday = addDaysToDateStr(monday, 6);

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_date, booking_time, customer_name, headcount, status')
    .gte('booking_date', monday)
    .lte('booking_date', sunday)
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(monday, i));
  const bookingsByDay = groupBookingsByDay<WeeklyBookingSummary & { booking_date: string }>(bookings ?? [], weekDays);

  return (
    <div className="flex flex-col">
      <WeeklyNav monday={monday} todayDate={todayDate} />
      <div>
        {weekDays.map((date) => (
          <WeeklyDayRow key={date} date={date} bookings={bookingsByDay.get(date) ?? []} isToday={date === todayDate} />
        ))}
      </div>
    </div>
  );
}
