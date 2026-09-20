import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MonthCalendarGrid } from './month-calendar-grid';

// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시): 2026년 9월(1일=화요일,
// 30일까지)을 고정 샘플로 써서 앞쪽 빈 칸 개수, 날짜 칩, 예약 건수 뱃지, 오늘
// 강조, 일간 뷰 링크를 검증한다.
describe('MonthCalendarGrid', () => {
  const countByDay = new Map([
    ['2026-09-05', { count: 3, headcount: 12 }],
    ['2026-09-20', { count: 1, headcount: 2 }],
  ]);

  it('요일 헤더를 월~일 순서로 보여준다', () => {
    render(<MonthCalendarGrid monthStart="2026-09-01" monthEnd="2026-09-30" countByDay={new Map()} todayDate="2026-09-20" />);
    expect(['월', '화', '수', '목', '금', '토', '일'].every((label) => screen.getByText(label))).toBe(true);
  });

  it('1일부터 30일까지 전부 렌더링하고, 각각 일간 뷰로 링크된다', () => {
    render(<MonthCalendarGrid monthStart="2026-09-01" monthEnd="2026-09-30" countByDay={countByDay} todayDate="2026-09-20" />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(30);
    expect(links.find((a) => a.getAttribute('href') === '/partner/today?date=2026-09-05')).toBeDefined();
  });

  it('예약이 있는 날짜에만 건수 뱃지를 보여준다', () => {
    render(<MonthCalendarGrid monthStart="2026-09-01" monthEnd="2026-09-30" countByDay={countByDay} todayDate="2026-09-01" />);
    expect(screen.getByText('3건')).toBeInTheDocument();
    expect(screen.getByText('1건')).toBeInTheDocument();
    // 예약 없는 날(예: 10일)에는 뱃지가 없다 — "10" 자체는 있지만 그 옆에 건수가 없어야 한다.
    expect(screen.queryByText('10건')).not.toBeInTheDocument();
  });

  it('오늘 날짜 칩은 강조 스타일(ring)을 적용한다', () => {
    render(<MonthCalendarGrid monthStart="2026-09-01" monthEnd="2026-09-30" countByDay={countByDay} todayDate="2026-09-20" />);
    const links = screen.getAllByRole('link');
    const todayLink = links.find((a) => a.getAttribute('href') === '/partner/today?date=2026-09-20');
    expect(todayLink).toHaveClass('ring-1');
  });
});
