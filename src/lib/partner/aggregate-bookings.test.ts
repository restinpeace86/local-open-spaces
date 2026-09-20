import { describe, expect, it } from 'vitest';
import { aggregateBookingsByDay, groupBookingsByDay } from './aggregate-bookings';

describe('groupBookingsByDay', () => {
  const days = ['2026-09-21', '2026-09-22', '2026-09-23'];

  it('전달된 모든 날짜를 키로 갖고, 예약이 없는 날은 빈 배열이다', () => {
    const result = groupBookingsByDay([], days);
    expect([...result.keys()]).toEqual(days);
    expect(result.get('2026-09-22')).toEqual([]);
  });

  it('booking_date가 같은 예약끼리 같은 날짜 키에 묶인다', () => {
    const bookings = [
      { id: 'a', booking_date: '2026-09-21' },
      { id: 'b', booking_date: '2026-09-22' },
      { id: 'c', booking_date: '2026-09-21' },
    ];
    const result = groupBookingsByDay(bookings, days);
    expect(result.get('2026-09-21')).toEqual([bookings[0], bookings[2]]);
    expect(result.get('2026-09-22')).toEqual([bookings[1]]);
    expect(result.get('2026-09-23')).toEqual([]);
  });

  it('전달된 days 목록에 없는 날짜의 예약은 조용히 버려진다(범위 밖 데이터가 섞여도 화면이 깨지지 않음)', () => {
    const bookings = [{ id: 'x', booking_date: '2099-01-01' }];
    const result = groupBookingsByDay(bookings, days);
    expect([...result.values()].flat()).toEqual([]);
  });
});

describe('aggregateBookingsByDay', () => {
  it('빈 배열이면 총합계가 모두 0이고 날짜별 맵도 비어 있다', () => {
    const result = aggregateBookingsByDay([]);
    expect(result).toEqual({ countByDay: new Map(), totalCount: 0, totalHeadcount: 0 });
  });

  it('같은 날짜의 예약을 합산하고, 전체 총합계도 함께 계산한다', () => {
    const result = aggregateBookingsByDay([
      { booking_date: '2026-09-05', headcount: 3 },
      { booking_date: '2026-09-05', headcount: 2 },
      { booking_date: '2026-09-20', headcount: 4 },
    ]);
    expect(result.countByDay.get('2026-09-05')).toEqual({ count: 2, headcount: 5 });
    expect(result.countByDay.get('2026-09-20')).toEqual({ count: 1, headcount: 4 });
    expect(result.totalCount).toBe(3);
    expect(result.totalHeadcount).toBe(9);
  });
});
