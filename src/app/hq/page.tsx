import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

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
// [대시보드를 요약 목록으로 재구성](2026-09-23 사용자 지시): "대시보드에서부터 이렇게
// 하지말고 대시보드는 리스트 형태라던가 혹은 요약형태로.. 그거 누르면 지금
// 대시보드에 나오는 형태로 좀 나오게 하던가" — 원래는 파트너마다 예약 표 전체를
// 이 화면 하나에 다 펼쳐놨는데(스크롤 버그와 별개로도), 파트너가 늘어날수록 한
// 화면에 모든 파트너의 모든 예약이 쌓여 탐색이 어려워진다. 파트너별 예약 건수만
// 보여주는 요약 목록으로 바꾸고, 실제 예약 표(기존 형태)는 각 파트너를 눌렀을 때
// 이동하는 상세 페이지(/hq/partners/[id])로 옮겼다.
//
// [집계를 JS에서 처리](제5장 제4조 기존 구조 우선): monthly/page.tsx가 이미 같은
// 이유로 GROUP BY 대신 JS 집계를 쓰고 있다 — 파트너 수/예약 수가 아직 복잡한 SQL
// 집계 쿼리를 새로 만들 규모가 아니다. bookings는 건수 집계에만 쓰이므로
// partner_id만 select해 페이로드를 줄인다(상세 화면에서 나머지 컬럼을 조회).
export default async function HqDashboardPage() {
  const admin = createAdminClient();

  const { data: partners } = await admin.from('partners').select('id, farm_name').order('farm_name', { ascending: true });
  const { data: bookingPartnerIds } = await admin.from('bookings').select('partner_id');

  const countByPartner = new Map<string, number>();
  for (const row of bookingPartnerIds ?? []) {
    countByPartner.set(row.partner_id, (countByPartner.get(row.partner_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">
      <div>
        <h1 className="text-lg font-bold text-gray-900">HQ 대시보드</h1>
        <p className="text-sm text-gray-500">
          전체 파트너 {partners?.length ?? 0}곳 · 예약 {bookingPartnerIds?.length ?? 0}건
        </p>
      </div>

      {(!partners || partners.length === 0) && (
        <p className="py-10 text-center text-sm text-gray-400">등록된 파트너가 없어요.</p>
      )}

      <div className="flex flex-col gap-2">
        {partners?.map((partner) => (
          <Link
            key={partner.id}
            href={`/hq/partners/${partner.id}`}
            className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:bg-gray-50"
          >
            <span className="text-base font-bold text-gray-900">{partner.farm_name}</span>
            <span className="flex items-center gap-1 text-sm text-gray-500">
              예약 {countByPartner.get(partner.id) ?? 0}건
              <span aria-hidden>›</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
