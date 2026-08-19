import { NearbyItem } from '@/lib/spaces/get-nearby';

export type CalendarDay = {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  inCurrentMonth: boolean;
  items: NearbyItem[];
};

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 일요일 시작 6주(42칸) 그리드를 구성하고, 각 날짜에 겹치는 행사를 매핑한다.
export function buildCalendarGrid(year: number, month: number, items: NearbyItem[]): CalendarDay[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const dateKey = toDateKey(date);

    const dayItems = items.filter(
      (item) => item.start_date && item.end_date && item.start_date <= dateKey && item.end_date >= dateKey
    );

    days.push({
      date,
      dateKey,
      inCurrentMonth: date.getMonth() === month - 1,
      items: dayItems,
    });
  }

  return days;
}
