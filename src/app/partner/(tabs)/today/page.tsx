// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "[⏰ 오늘(일간)] (기본 홈 디폴트: 시간대별 타임스케줄 및 출석 체크)" — 실제 예약
// 데이터 조회/타임스케줄 UI는 다음 단계(bookings 연동)에서 구현한다. 지금은 하단
// 탭바 뼈대와 이 화면의 존재 자체가 목표라 빈 상태를 정직하게 보여준다(가짜 데이터로
// 채우지 않음).
export default function PartnerTodayPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="text-3xl" aria-hidden>
        ⏰
      </span>
      <h1 className="text-base font-bold text-gray-900">오늘</h1>
      <p className="text-sm text-gray-500">오늘 예약된 시간대별 일정이 여기에 표시될 예정이에요.</p>
    </div>
  );
}
