import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonthlyNav } from './monthly-nav';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// [나드리픽 파트너 PMS — 월간 뷰](2026-09-20 사용자 지시): 전월/다음달 이동과
// "이번달로 이동" 바로가기를 검증한다.
describe('MonthlyNav', () => {
  afterEach(() => {
    pushMock.mockReset();
  });

  it('"N년 N월" 형식으로 표시한다', () => {
    render(<MonthlyNav monthAnchor="2026-09-01" todayDate="2026-09-20" />);
    expect(screen.getByText('2026년 9월')).toBeInTheDocument();
  });

  it('◀ 버튼을 누르면 전월 1일로 이동한다', () => {
    render(<MonthlyNav monthAnchor="2026-09-01" todayDate="2026-09-20" />);
    fireEvent.click(screen.getByLabelText('전월'));
    expect(pushMock).toHaveBeenCalledWith('/partner/monthly?date=2026-08-01');
  });

  it('▶ 버튼을 누르면 다음달 1일로 이동한다', () => {
    render(<MonthlyNav monthAnchor="2026-09-01" todayDate="2026-09-20" />);
    fireEvent.click(screen.getByLabelText('다음달'));
    expect(pushMock).toHaveBeenCalledWith('/partner/monthly?date=2026-10-01');
  });

  it('이번달이 아니면 "이번달로 이동" 버튼이 보이고, 누르면 이번달 1일로 이동한다', () => {
    render(<MonthlyNav monthAnchor="2026-08-01" todayDate="2026-09-20" />);
    fireEvent.click(screen.getByText('이번달로 이동'));
    expect(pushMock).toHaveBeenCalledWith('/partner/monthly?date=2026-09-01');
  });

  it('이번달을 보고 있으면 "이번달로 이동" 버튼이 보이지 않는다', () => {
    render(<MonthlyNav monthAnchor="2026-09-01" todayDate="2026-09-20" />);
    expect(screen.queryByText('이번달로 이동')).not.toBeInTheDocument();
  });
});
