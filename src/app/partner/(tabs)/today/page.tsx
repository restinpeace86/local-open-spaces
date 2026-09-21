import { createClient } from '@/lib/supabase/server';
import { todayKstDateString } from '@/lib/partner/date';
import { DailyDateNav } from '@/components/partner/daily-date-nav';
import { BookingCard } from '@/components/partner/booking-card';
import { AddBookingFab } from '@/components/partner/add-booking-fab';

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "[⏰ 오늘(일간)] (기본 홈 디폴트: 시간대별 타임스케줄)". Phase 1 스텁을 실제 데이터
// 조회 화면으로 교체한다. Next.js 16 규칙상 searchParams는 Promise다(이 코드베이스
// 최초의 searchParams 사용 — 기존 전례 없음, 프레임워크 규칙을 그대로 따름).
//
// [RLS로 데이터 격리](요구사항 2): service_role이 아닌 세션 기반 클라이언트를 써서
// bookings_select_own(auth.uid() = partner_id) 정책이 그대로 작동하게 한다 — 이 쿼리는
// partner_id를 코드에서 직접 필터하지 않는다(RLS가 이미 본인 것만 보이게 강제하므로
// 중복 검증 불필요).
export default async function PartnerTodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: rawDate } = await searchParams;
  const todayDate = todayKstDateString();
  // 형식이 맞지 않는 값(예: 잘못된 링크 공유)이 들어와도 조용히 오늘로 폴백한다
  // (추측해서 보정하지 않고, 안전한 기본값으로만 대체 — 제5장 제11조).
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDate;

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, customer_name, customer_phone, booking_time, headcount, source, status, memo, product_name, total_price')
    .eq('booking_date', date)
    .order('booking_time', { ascending: true });

  return (
    <div className="flex flex-col">
      <DailyDateNav date={date} todayDate={todayDate} />
      <div className="flex flex-col gap-3 p-4">
        {!bookings || bookings.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">이 날짜에 예약된 일정이 없어요.</p>
        ) : (
          bookings.map((booking) => <BookingCard key={booking.id} booking={booking} />)
        )}
      </div>
      {/* [수기 예약 등록](2026-09-20 사용자 지시): 기본 날짜는 "일간 뷰에서 현재
          보고 있던 날짜"(요구사항 2) — 지금 이 페이지가 보여주는 date를 그대로
          넘긴다. */}
      <AddBookingFab defaultDate={date} />
    </div>
  );
}
