import { createClient } from '@/lib/supabase/server';
import { todayKstDateString } from '@/lib/partner/date';
import { DailyDateNav } from '@/components/partner/daily-date-nav';
import { BookingCard } from '@/components/partner/booking-card';
import { AddBookingFab, AddBookingProduct } from '@/components/partner/add-booking-fab';

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

  // [성능](2026-09-23 사용자 지시): "/partner 쪽 너무 반응이 느린거 같은데?" —
  // 아래 두 쿼리는 서로 결과에 의존하지 않는 독립 조회인데 순차 await로 짜여 있어
  // 매 페이지 로드마다 네트워크 왕복이 그대로 더해지고 있었다(실측: Vercel
  // 서버리스 함수에서 Supabase로의 각 왕복이 개별로는 빨라도 순차로 쌓이면
  // 체감 지연이 컸다). 서로 독립적이므로 Promise.all로 병렬 실행한다.
  //
  // [파트너 상품 관리](2026-09-23 사용자 지시): "상품명/객실명을.. 그냥 상품명으로
  // 통일하고 콤보박스로 선택하게 해" — 예전 예약의 상품명 이력을 자동완성으로
  // 제안하던 방식(recentProductRows) 대신, 파트너가 더보기 > 상품 관리에서
  // 직접 등록해둔 상품 카탈로그(이름/가격/가격 기준)를 그대로 선택지로 쓴다.
  const supabase = await createClient();
  const [{ data: bookings }, { data: products }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, customer_name, customer_phone, booking_time, headcount, source, status, memo, product_name, total_price')
      .eq('booking_date', date)
      .order('booking_time', { ascending: true }),
    supabase.from('partner_products').select('id, name, price, pricing_unit').order('created_at', { ascending: true }),
  ]);

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
      {/* [pricing_unit 캐스팅] DB 컬럼이 text + check 제약이라 codegen 타입은
          좁은 리터럴 유니언이 아닌 string으로 나온다 — DB가 이미 값 범위를
          강제하므로 여기서 안전하게 좁혀도 된다. */}
      <AddBookingFab defaultDate={date} products={(products ?? []) as AddBookingProduct[]} />
    </div>
  );
}
