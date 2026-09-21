import { createAdminClient } from '@/lib/supabase/admin';
import { HqBookingRow, HqBookingRowData } from '@/components/hq/hq-booking-row';

// [빌드 시 정적 프리렌더링 버그 발견 및 수정](2026-09-22, npm run build 결과 확인 중
// 실측): 이 페이지는 세션 쿠키를 쓰는 createClient()가 아니라 createAdminClient()
// (서비스 롤)만 써서 Next.js가 "요청별로 달라지는 게 없다"고 자동 판단해 빌드
// 시점 스냅샷으로 정적 프리렌더링해버렸다(`npm run build` 출력에서 `/hq`만
// `○`(Static)로 표시됨 — today/weekly/monthly는 세션 클라이언트를 써서 쿠키 접근이
// 자동으로 동적 렌더링을 유발해 `ƒ`(Dynamic)였음). 정적으로 굳으면 배포 이후 예약이
// 추가/삭제돼도 다음 배포 전까지 화면이 빌드 시점 스냅샷에 영원히 멈춘다 — HQ
// 대시보드의 목적(실시간 전체 현황)과 정반대라 명시적으로 강제한다.
export const dynamic = 'force-dynamic';

// [HQ 전체 파트너 데이터 열람/삭제 권한](2026-09-22 사용자 지시): "관리자에 대하여는
// 기존 데이터 다 보여야하고 삭제할 수 있는 권한도 있어야돼" — 이 화면(스텁이었던
// HQ 대시보드)을 실제 전체 파트너/예약 목록으로 교체한다. 이 라우트는 middleware.ts가
// 이미 이메일 화이트리스트로 접근을 막아뒀으므로(src/lib/hq/is-hq-staff.ts), 여기서
// 도달했다는 것 자체가 HQ 권한이 확인됐다는 뜻이다 — 페이지 레벨에서 다시 확인할
// 필요는 없다(다만 데이터를 실제로 지우는 deleteBookingAsHq 액션 쪽은 별개로 한 번 더
// 확인한다, 그 파일 주석 참고).
//
// [집계를 JS에서 처리](제5장 제4조 기존 구조 우선): monthly/page.tsx가 이미 같은
// 이유로 GROUP BY 대신 JS 집계를 쓰고 있다 — 파트너 수/예약 수가 아직 복잡한 SQL
// 집계 쿼리를 새로 만들 규모가 아니다.
export default async function HqDashboardPage() {
  const admin = createAdminClient();

  const { data: partners } = await admin.from('partners').select('id, farm_name').order('farm_name', { ascending: true });
  const { data: bookings } = await admin
    .from('bookings')
    .select('id, partner_id, customer_name, customer_phone, booking_date, booking_time, headcount, source, status, product_name, total_price')
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: false });

  const bookingsByPartner = new Map<string, HqBookingRowData[]>();
  for (const booking of bookings ?? []) {
    if (!bookingsByPartner.has(booking.partner_id)) bookingsByPartner.set(booking.partner_id, []);
    bookingsByPartner.get(booking.partner_id)!.push(booking);
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-12">
      <div>
        <h1 className="text-lg font-bold text-gray-900">HQ 대시보드</h1>
        <p className="text-sm text-gray-500">
          전체 파트너 {partners?.length ?? 0}곳 · 예약 {bookings?.length ?? 0}건
        </p>
      </div>

      {(!partners || partners.length === 0) && (
        <p className="py-10 text-center text-sm text-gray-400">등록된 파트너가 없어요.</p>
      )}

      {partners?.map((partner) => {
        const partnerBookings = bookingsByPartner.get(partner.id) ?? [];
        return (
          <section key={partner.id} className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-base font-bold text-gray-900">
              {partner.farm_name} <span className="font-normal text-gray-400">— 예약 {partnerBookings.length}건</span>
            </h2>
            {partnerBookings.length === 0 ? (
              <p className="text-sm text-gray-400">등록된 예약이 없어요.</p>
            ) : (
              <div className="overflow-x-auto">
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
          </section>
        );
      })}
    </div>
  );
}
