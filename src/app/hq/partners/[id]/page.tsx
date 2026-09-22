import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { HqBookingRow, HqBookingRowData } from '@/components/hq/hq-booking-row';
import { groupBookingsByDate } from '@/lib/hq/group-bookings-by-date';
import { formatMonthDayWithWeekday } from '@/lib/partner/date';

// [HQ 대시보드를 요약 목록으로 재구성](2026-09-23 사용자 지시): "그거 누르면 지금
// 대시보드에 나오는 형태로 좀 나오게 하던가" — /hq(요약 목록)에서 파트너를 누르면
// 오는 상세 화면. 원래 /hq 페이지에 파트너별로 전부 펼쳐 보여주던 예약 표를 그대로
// 여기로 옮겼다(HqBookingRow 등 기존 컴포넌트 재사용, 제5장 제4조).
export const dynamic = 'force-dynamic';

// [일자별 접기/펼치기](2026-09-23 사용자 지시): "일자별로 영역나눠서 일자별 접기
// 펼치기 할수있게해줘. 예를들어 9/23에 9건, 9/22에 3건 예약 들어왔으면 9/23이
// 제일 위에 오고 펼쳐져있어서 9건 보이고 9/22 3건은.. 접기 되어있고" — 정렬은
// 이미 아래 쿼리(booking_date desc)가 보장하고, 날짜 경계로 묶기만 하면 되므로
// (groupBookingsByDate) 별도 클라이언트 상태 없이 네이티브 `<details>`/`<summary>`
// 로 구현한다 — 첫 번째(가장 최신 날짜) 그룹만 `open`, 나머지는 기본 접힘. 브라우저
// 기본 동작이라 JS 없이도 서버 컴포넌트로 그대로 렌더링할 수 있다(제5장 제4조 —
// 접기/펼치기 때문에 굳이 클라이언트 컴포넌트로 바꿀 필요 없음).
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
  const dateGroups = groupBookingsByDate(partnerBookings);

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">
      <Link href="/hq" className="w-fit text-sm text-gray-500 hover:text-gray-700">
        ‹ HQ 대시보드
      </Link>

      <div>
        <h1 className="text-lg font-bold text-gray-900">{partner.farm_name}</h1>
        <p className="text-sm text-gray-500">예약 {partnerBookings.length}건</p>
      </div>

      {dateGroups.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">등록된 예약이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {dateGroups.map((group, index) => (
            <details
              key={group.date}
              open={index === 0}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
            >
              <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                <span>{formatMonthDayWithWeekday(group.date)}</span>
                <span className="text-xs font-normal text-gray-400">{group.bookings.length}건</span>
              </summary>
              <div className="overflow-x-auto border-t border-gray-100 px-4 pb-4">
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
                    {group.bookings.map((booking) => (
                      <HqBookingRow key={booking.id} booking={booking} />
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
