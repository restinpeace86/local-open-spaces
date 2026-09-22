import { describe, expect, it } from 'vitest';
import { groupBookingsByDate } from './group-bookings-by-date';

describe('groupBookingsByDate', () => {
  it('같은 날짜의 연속된 예약을 하나의 그룹으로 묶는다', () => {
    const bookings = [
      { id: '1', booking_date: '2026-09-23' },
      { id: '2', booking_date: '2026-09-23' },
      { id: '3', booking_date: '2026-09-22' },
    ];
    expect(groupBookingsByDate(bookings)).toEqual([
      { date: '2026-09-23', bookings: [bookings[0], bookings[1]] },
      { date: '2026-09-22', bookings: [bookings[2]] },
    ]);
  });

  it('입력 순서(최신 날짜가 먼저)를 그대로 보존한다', () => {
    const bookings = [
      { id: '1', booking_date: '2026-09-23' },
      { id: '2', booking_date: '2026-09-20' },
      { id: '3', booking_date: '2026-09-18' },
    ];
    const groups = groupBookingsByDate(bookings);
    expect(groups.map((g) => g.date)).toEqual(['2026-09-23', '2026-09-20', '2026-09-18']);
  });

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(groupBookingsByDate([])).toEqual([]);
  });

  it('같은 날짜가 떨어져서(비연속) 나오면 별도 그룹으로 취급한다(정렬된 입력을 전제)', () => {
    // 이 함수는 이미 정렬된 입력만 받는다는 전제라 — 비연속 같은 날짜는 의도적으로
    // 재병합하지 않는다(호출부가 정렬을 보장해야 함을 문서화하는 케이스).
    const bookings = [
      { id: '1', booking_date: '2026-09-23' },
      { id: '2', booking_date: '2026-09-22' },
      { id: '3', booking_date: '2026-09-23' },
    ];
    const groups = groupBookingsByDate(bookings);
    expect(groups).toHaveLength(3);
  });
});
