// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "[🗓️ 주간] (7일간의 예약 리스트 - 월~일 7개 리스트 row)" — 실제 조회/렌더링은
// bookings 연동 단계에서 구현한다.
export default function PartnerWeeklyPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="text-3xl" aria-hidden>
        🗓️
      </span>
      <h1 className="text-base font-bold text-gray-900">주간</h1>
      <p className="text-sm text-gray-500">이번 주 7일간의 예약 리스트가 여기에 표시될 예정이에요.</p>
    </div>
  );
}
