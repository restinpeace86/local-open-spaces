'use client';

import { useRouter } from 'next/navigation';
import { addMonthsToDateStr, formatKoreanYearMonth, getFirstDayOfMonth } from '@/lib/partner/date';

// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시): DailyDateNav/WeeklyNav와
// 동일한 시각 관례(제5장 제4조).
export function MonthlyNav({ monthAnchor, todayDate }: { monthAnchor: string; todayDate: string }) {
  const router = useRouter();
  const isCurrentMonth = monthAnchor === getFirstDayOfMonth(todayDate);

  function goTo(nextMonthAnchor: string) {
    router.push(`/partner/monthly?date=${nextMonthAnchor}`);
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 py-3">
      <button
        type="button"
        onClick={() => goTo(addMonthsToDateStr(monthAnchor, -1))}
        aria-label="전월"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-gray-600 hover:bg-gray-100"
      >
        ◀
      </button>

      <div className="flex flex-1 flex-col items-center">
        <span className="text-base font-bold text-gray-900">{formatKoreanYearMonth(monthAnchor)}</span>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={() => goTo(getFirstDayOfMonth(todayDate))}
            className="mt-0.5 text-xs font-medium text-blue-600"
          >
            이번달로 이동
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => goTo(addMonthsToDateStr(monthAnchor, 1))}
        aria-label="다음달"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-gray-600 hover:bg-gray-100"
      >
        ▶
      </button>
    </div>
  );
}
