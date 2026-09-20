import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeeklyDayRow } from './weekly-day-row';

// [나드리픽 파트너 PMS — 주간 뷰](2026-09-20 사용자 지시): 예약 유무에 따른 표시,
// 취소 건 시각 구분, 오늘 뱃지, 일간 뷰로의 링크 연결을 검증한다.
describe('WeeklyDayRow', () => {
  it('예약이 없으면 "예약 없음"을 보여준다', () => {
    render(<WeeklyDayRow date="2026-09-22" bookings={[]} isToday={false} />);
    expect(screen.getByText('예약 없음')).toBeInTheDocument();
  });

  it('예약이 있으면 건수/인원 합계와 각 예약을 시간/이름/인원으로 한 줄씩 보여준다', () => {
    render(
      <WeeklyDayRow
        date="2026-09-22"
        bookings={[
          { id: 'b1', booking_time: '10:00:00', customer_name: '김손님', headcount: 2, status: 'confirmed' },
          { id: 'b2', booking_time: '14:30:00', customer_name: '이손님', headcount: 3, status: 'confirmed' },
        ]}
        isToday={false}
      />
    );
    expect(screen.getByText('2건 · 5명')).toBeInTheDocument();
    expect(screen.getByText('10:00 · 김손님 · 2명')).toBeInTheDocument();
    expect(screen.getByText('14:30 · 이손님 · 3명')).toBeInTheDocument();
  });

  it('취소된 예약은 취소선으로 표시한다', () => {
    render(
      <WeeklyDayRow
        date="2026-09-22"
        bookings={[{ id: 'b1', booking_time: '10:00:00', customer_name: '김손님', headcount: 2, status: 'cancelled' }]}
        isToday={false}
      />
    );
    expect(screen.getByText('10:00 · 김손님 · 2명')).toHaveClass('line-through');
  });

  it('오늘 날짜면 "오늘" 뱃지를 보여준다', () => {
    render(<WeeklyDayRow date="2026-09-22" bookings={[]} isToday />);
    expect(screen.getByText('오늘')).toBeInTheDocument();
  });

  it('행 전체가 해당 날짜의 일간 뷰로 연결된다', () => {
    render(<WeeklyDayRow date="2026-09-22" bookings={[]} isToday={false} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/partner/today?date=2026-09-22');
  });
});
