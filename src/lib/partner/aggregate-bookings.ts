// [나드리픽 파트너 PMS — 주간/월간 뷰](2026-09-20 사용자 지시): 페이지(Server
// Component) 안에 인라인으로 두면 테스트하기 어려운 집계 로직을 순수 함수로
// 분리한다 — DB에 GROUP BY를 맡기지 않고(한 파트너의 한 달 예약량은 앱 레이어
// 집계로 충분) JS에서 계산한다(get-home-feed.ts 등 이 프로젝트의 기존 관례).
export type DayAggregate = { count: number; headcount: number };

// 주간 뷰: 날짜별로 예약을 묶는다. `days`에 미리 정해둔 7개 날짜를 넘겨 예약이
// 0건인 날도 빈 배열로 항상 키가 존재하게 한다(화면에서 "예약 없음"을 보여주기
// 위해 Map.get이 undefined가 아니어야 함).
export function groupBookingsByDay<T extends { booking_date: string }>(bookings: T[], days: string[]): Map<string, T[]> {
  const map = new Map<string, T[]>(days.map((d) => [d, []]));
  for (const booking of bookings) {
    map.get(booking.booking_date)?.push(booking);
  }
  return map;
}

// 월간 뷰: 날짜별 건수/인원 합계와 월 전체 총합계를 함께 계산한다.
export function aggregateBookingsByDay(
  bookings: Array<{ booking_date: string; headcount: number }>
): { countByDay: Map<string, DayAggregate>; totalCount: number; totalHeadcount: number } {
  const countByDay = new Map<string, DayAggregate>();
  let totalCount = 0;
  let totalHeadcount = 0;
  for (const booking of bookings) {
    totalCount += 1;
    totalHeadcount += booking.headcount;
    const entry = countByDay.get(booking.booking_date) ?? { count: 0, headcount: 0 };
    entry.count += 1;
    entry.headcount += booking.headcount;
    countByDay.set(booking.booking_date, entry);
  }
  return { countByDay, totalCount, totalHeadcount };
}
