'use client';

import { useRouter } from 'next/navigation';
import { addDaysToDateStr, formatMonthDayWithWeekday, getMondayOfWeek } from '@/lib/partner/date';

// [나드리픽 파트너 PMS — 주간 뷰](2026-09-20 사용자 지시): "상단에 주간 이동
// 컨트롤러(전주/다음주)". DailyDateNav와 동일한 시각 관례(큰 원형 버튼, "오늘로
// 이동"과 대응하는 "이번주로 이동" 바로가기)를 그대로 따른다(제5장 제4조).
export function WeeklyNav({ monday, todayDate }: { monday: string; todayDate: string }) {
  const router = useRouter();
  const sunday = addDaysToDateStr(monday, 6);
  const isCurrentWeek = monday === getMondayOfWeek(todayDate);

  function goTo(nextMonday: string) {
    router.push(`/partner/weekly?date=${nextMonday}`);
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 py-3">
      <button
        type="button"
        onClick={() => goTo(addDaysToDateStr(monday, -7))}
        aria-label="전주"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-gray-600 hover:bg-gray-100"
      >
        ◀
      </button>

      <div className="flex flex-1 flex-col items-center">
        <span className="text-base font-bold text-gray-900">
          {formatMonthDayWithWeekday(monday)} ~ {formatMonthDayWithWeekday(sunday)}
        </span>
        {!isCurrentWeek && (
          <button
            type="button"
            onClick={() => goTo(getMondayOfWeek(todayDate))}
            className="mt-0.5 text-xs font-medium text-blue-600"
          >
            이번주로 이동
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => goTo(addDaysToDateStr(monday, 7))}
        aria-label="다음주"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-gray-600 hover:bg-gray-100"
      >
        ▶
      </button>
    </div>
  );
}
