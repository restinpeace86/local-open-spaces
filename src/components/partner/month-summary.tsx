// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시, docs/partner_spec.md
// 5절): "월 상단에 총합계 지표 칩(이번 달 총 예약 건수, 총 방문 인원 등) 요약
// 표시". 취소된 예약도 실제로 접수된 기록이라는 점에서 구분 없이 전체를 센다
// (확정/완료/노쇼/취소를 가려 세는 기준은 지시되지 않아 추측하지 않는다 —
// 제3장 제5조). 필요하면 추후 상태별 집계로 확장 가능.
export function MonthSummary({ totalCount, totalHeadcount }: { totalCount: number; totalHeadcount: number }) {
  return (
    <div className="flex gap-2 px-4 py-3">
      <div className="flex-1 rounded-xl bg-blue-50 px-3 py-2.5 text-center">
        <p className="text-xl font-bold text-blue-700">{totalCount}건</p>
        <p className="text-xs text-blue-500">이번 달 총 예약</p>
      </div>
      <div className="flex-1 rounded-xl bg-emerald-50 px-3 py-2.5 text-center">
        <p className="text-xl font-bold text-emerald-700">{totalHeadcount}명</p>
        <p className="text-xs text-emerald-500">총 방문 인원</p>
      </div>
    </div>
  );
}
