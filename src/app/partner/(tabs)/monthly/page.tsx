// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "[📊 월간] (월 총합계 및 일별 지표 칩 뷰 — 캘린더 형태)" — 실제 집계/캘린더 렌더링은
// bookings 연동 단계에서 구현한다.
export default function PartnerMonthlyPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="text-3xl" aria-hidden>
        📊
      </span>
      <h1 className="text-base font-bold text-gray-900">월간</h1>
      <p className="text-sm text-gray-500">이번 달 예약 캘린더와 집계 지표가 여기에 표시될 예정이에요.</p>
    </div>
  );
}
