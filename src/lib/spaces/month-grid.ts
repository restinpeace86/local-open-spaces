// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2]): calendar-grid.ts의 buildCalendarGrid()와 같은 "일요일 시작 6주(42칸)
// 그리드" 모양이지만, 그쪽은 NearbyItem[]과 결합돼 있어 이 화면(단일 이벤트의 운영일
// 하이라이트, 아이템 목록이 필요 없음)에는 맞지 않는다 — 날짜 격자만 만드는 더 작은
// 버전을 별도로 둔다(제5장 제4조 — 기존 파일을 억지로 일반화하기보다 목적이 다른
// 곳엔 필요한 만큼만 작게 새로 둔다).
export type MonthGridDay = {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  inCurrentMonth: boolean;
};

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildMonthDateGrid(year: number, month: number): MonthGridDay[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());

  const days: MonthGridDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    days.push({ date, dateKey: toDateKey(date), inCurrentMonth: date.getMonth() === month - 1 });
  }
  return days;
}
