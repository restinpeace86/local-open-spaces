import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { HqBookingRow, HqBookingRowData } from '@/components/hq/hq-booking-row';

// [HQ 대시보드를 요약 목록으로 재구성](2026-09-23 사용자 지시): "그거 누르면 지금
// 대시보드에 나오는 형태로 좀 나오게 하던가" — /hq(요약 목록)에서 파트너를 누르면
// 오는 상세 화면. 원래 /hq 페이지에 파트너별로 전부 펼쳐 보여주던 예약 표를 그대로
// 여기로 옮겼다(HqBookingRow 등 기존 컴포넌트 재사용, 제5장 제4조).
export const dynamic = 'force-dynamic';

export default async function HqPartnerBookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: partner } = await admin.from('partners').select('id, farm_name').eq('id', id).maybeSingle();
  if (!partner) notFound();

  const { data: bookings } = await admin
    .from('bookings')
    .select('id, partner_id, customer_name, customer_phone, booking_date, booking_time, headcount, source, status, product_name, total_price')
    .eq('partner_id', id)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: false });

  const partnerBookings: HqBookingRowData[] = bookings ?? [];

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">
      <Link href="/hq" className="w-fit text-sm text-gray-500 hover:text-gray-700">
        ‹ HQ 대시보드
      </Link>

      <div>
        <h1 className="text-lg font-bold text-gray-900">{partner.farm_name}</h1>
        <p className="text-sm text-gray-500">예약 {partnerBookings.length}건</p>
      </div>

      {partnerBookings.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">등록된 예약이 없어요.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-4">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-400">
                <th className="px-3 py-2">일시</th>
                <th className="px-3 py-2">예약자</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">인원</th>
                <th className="px-3 py-2">상품</th>
                <th className="px-3 py-2">금액</th>
                <th className="px-3 py-2">출처</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {partnerBookings.map((booking) => (
                <HqBookingRow key={booking.id} booking={booking} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
