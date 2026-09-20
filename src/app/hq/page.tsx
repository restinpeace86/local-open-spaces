// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 9절):
// "본사 운영진 전용... 대시보드 진입 뼈대 라우트" — 전체 파트너 현황 집계/임퍼소네이션
// 등 실제 관제 기능(spec.md 9절)은 다음 단계에서 구현한다.
export default function HqDashboardPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="text-3xl" aria-hidden>
        🏢
      </span>
      <h1 className="text-lg font-bold text-gray-900">HQ 대시보드</h1>
      <p className="text-sm text-gray-500">전체 파트너 현황 및 예약 집계가 여기에 표시될 예정이에요.</p>
    </div>
  );
}
