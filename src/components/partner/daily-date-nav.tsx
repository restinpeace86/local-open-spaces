'use client';

import { useRouter } from 'next/navigation';
import { addDaysToDateStr, formatKoreanDateWithWeekday } from '@/lib/partner/date';

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): "상단에 날짜 변경
// 컨트롤러 (전일/금일/익일 이동 및 날짜 선택)". 큰 터치 타깃(요구사항 1)을 위해
// 화살표 버튼을 넉넉한 크기로, 날짜는 네이티브 <input type="date">로 바로 고를 수
// 있게 한다(별도 커스텀 캘린더 UI를 새로 만들지 않음 — 월간 뷰에서 실제 캘린더
// 그리드가 필요해지면 그때 별도로 다룬다).
export function DailyDateNav({ date, todayDate }: { date: string; todayDate: string }) {
  const router = useRouter();

  function goTo(nextDate: string) {
    router.push(`/partner/today?date=${nextDate}`);
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 py-3">
      <button
        type="button"
        onClick={() => goTo(addDaysToDateStr(date, -1))}
        aria-label="전일"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-gray-600 hover:bg-gray-100"
      >
        ◀
      </button>

      <div className="flex flex-1 flex-col items-center">
        <label className="cursor-pointer text-center">
          <span className="text-base font-bold text-gray-900">{formatKoreanDateWithWeekday(date)}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && goTo(e.target.value)}
            className="block h-0 w-0 opacity-0"
            aria-label="날짜 선택"
          />
        </label>
        {date !== todayDate && (
          <button type="button" onClick={() => goTo(todayDate)} className="mt-0.5 text-xs font-medium text-blue-600">
            오늘로 이동
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => goTo(addDaysToDateStr(date, 1))}
        aria-label="익일"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-gray-600 hover:bg-gray-100"
      >
        ▶
      </button>
    </div>
  );
}
