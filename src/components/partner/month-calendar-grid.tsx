import Link from 'next/link';
import { DayAggregate } from '@/lib/partner/aggregate-bookings';

// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시, docs/partner_spec.md
// 5절): "월 전체를 조망할 수 있는 캘린더 그리드... 각 날짜 칩에 해당 일자의
// 예약 건수 요약 표시... 터치하면 일간 뷰로 즉시 점프". 주간 뷰가 월요일 시작
// 순서(월~일)를 쓰므로 이 캘린더도 같은 순서로 맞춰 두 화면 사이에 요일 배치가
// 뒤바뀌어 보이지 않게 한다(제5장 제4조 — 이번 세션에서 정한 관례를 그대로 유지).
const WEEKDAY_HEADERS = ['월', '화', '수', '목', '금', '토', '일'];

// 1일부터 말일까지, 앞뒤로 빈 칸(null)을 채워 7의 배수 길이로 만든다 — 그리드가
// 항상 온전한 주 단위 행으로 끝나게(마지막 주가 중간에 잘려 보이지 않도록).
function buildCalendarCells(monthStart: string, monthEnd: string): (string | null)[] {
  const firstWeekdaySun0 = new Date(`${monthStart}T00:00:00.000Z`).getUTCDay(); // 0=일 ... 6=토
  const leadingEmpty = (firstWeekdaySun0 + 6) % 7; // 월요일 시작 기준 인덱스로 변환
  const daysInMonth = Number(monthEnd.slice(8, 10));
  const monthPrefix = monthStart.slice(0, 8); // "YYYY-MM-"

  const cells: (string | null)[] = Array(leadingEmpty).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${monthPrefix}${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function MonthCalendarGrid({
  monthStart,
  monthEnd,
  countByDay,
  todayDate,
}: {
  monthStart: string;
  monthEnd: string;
  countByDay: Map<string, DayAggregate>;
  todayDate: string;
}) {
  const cells = buildCalendarCells(monthStart, monthEnd);

  return (
    <div className="grid grid-cols-7 gap-1 px-3 pb-4">
      {WEEKDAY_HEADERS.map((label, i) => (
        <div
          key={label}
          className={`py-1 text-center text-xs font-semibold ${i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-400'}`}
        >
          {label}
        </div>
      ))}
      {cells.map((dateStr, i) => {
        if (!dateStr) return <div key={`empty-${i}`} />;
        const dayNum = Number(dateStr.slice(8, 10));
        const aggregate = countByDay.get(dateStr);
        const isToday = dateStr === todayDate;
        return (
          <Link
            key={dateStr}
            href={`/partner/today?date=${dateStr}`}
            className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg ${
              isToday ? 'bg-blue-50 ring-1 ring-blue-400' : 'hover:bg-gray-50'
            }`}
          >
            <span className="text-sm font-semibold text-gray-800">{dayNum}</span>
            {aggregate && (
              <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{aggregate.count}건</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
