// [HQ 예약 상세 화면 일자별 접기/펼치기](2026-09-23 사용자 지시): "이거 일자별로
// 영역나눠서 일자별 접기 펼치기 할수있게해줘" — 이미 booking_date desc로 정렬된
// 목록(호출부 쿼리, /hq/partners/[id]/page.tsx)을 날짜 경계에서만 잘라 묶는다.
// 정렬은 DB 쿼리가 이미 보장하므로 여기서 다시 정렬하지 않는다(같은 작업을
// 두 번 하지 않음) — 입력이 booking_date 기준 정렬돼 있지 않으면 그룹이 날짜별로
// 온전히 모이지 않을 수 있다는 전제를 호출부가 지켜야 한다.
export function groupBookingsByDate<T extends { booking_date: string }>(
  bookings: readonly T[]
): { date: string; bookings: T[] }[] {
  const groups: { date: string; bookings: T[] }[] = [];
  for (const booking of bookings) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.date === booking.booking_date) {
      lastGroup.bookings.push(booking);
    } else {
      groups.push({ date: booking.booking_date, bookings: [booking] });
    }
  }
  return groups;
}
