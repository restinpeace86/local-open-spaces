import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeeklyNav } from './weekly-nav';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// [나드리픽 파트너 PMS — 주간 뷰](2026-09-20 사용자 지시): 전주/다음주 이동과
// "이번주로 이동" 바로가기를 검증한다.
describe('WeeklyNav', () => {
  afterEach(() => {
    pushMock.mockReset();
  });

  it('월요일~일요일 범위를 표시한다', () => {
    render(<WeeklyNav monday="2026-09-21" todayDate="2026-09-24" />);
    expect(screen.getByText('9/21 (월) ~ 9/27 (일)')).toBeInTheDocument();
  });

  it('◀ 버튼을 누르면 지난주 월요일로 이동한다', () => {
    render(<WeeklyNav monday="2026-09-21" todayDate="2026-09-24" />);
    fireEvent.click(screen.getByLabelText('전주'));
    expect(pushMock).toHaveBeenCalledWith('/partner/weekly?date=2026-09-14');
  });

  it('▶ 버튼을 누르면 다음주 월요일로 이동한다', () => {
    render(<WeeklyNav monday="2026-09-21" todayDate="2026-09-24" />);
    fireEvent.click(screen.getByLabelText('다음주'));
    expect(pushMock).toHaveBeenCalledWith('/partner/weekly?date=2026-09-28');
  });

  it('이번주가 아니면 "이번주로 이동" 버튼이 보이고, 누르면 이번주 월요일로 이동한다', () => {
    render(<WeeklyNav monday="2026-09-14" todayDate="2026-09-24" />);
    fireEvent.click(screen.getByText('이번주로 이동'));
    expect(pushMock).toHaveBeenCalledWith('/partner/weekly?date=2026-09-21');
  });

  it('이번주를 보고 있으면 "이번주로 이동" 버튼이 보이지 않는다', () => {
    render(<WeeklyNav monday="2026-09-21" todayDate="2026-09-24" />);
    expect(screen.queryByText('이번주로 이동')).not.toBeInTheDocument();
  });
});
