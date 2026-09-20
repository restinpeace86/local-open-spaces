import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyDateNav } from './daily-date-nav';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): 전일/금일/익일 이동과
// 날짜 선택 컨트롤을 검증한다.
describe('DailyDateNav', () => {
  afterEach(() => {
    pushMock.mockReset();
  });

  it('날짜와 요일을 한글로 보여준다', () => {
    render(<DailyDateNav date="2026-09-20" todayDate="2026-09-20" />);
    expect(screen.getByText('2026년 9월 20일 (일)')).toBeInTheDocument();
  });

  it('◀ 버튼을 누르면 하루 전 날짜로 이동한다', () => {
    render(<DailyDateNav date="2026-09-20" todayDate="2026-09-20" />);
    fireEvent.click(screen.getByLabelText('전일'));
    expect(pushMock).toHaveBeenCalledWith('/partner/today?date=2026-09-19');
  });

  it('▶ 버튼을 누르면 하루 뒤 날짜로 이동한다', () => {
    render(<DailyDateNav date="2026-09-20" todayDate="2026-09-20" />);
    fireEvent.click(screen.getByLabelText('익일'));
    expect(pushMock).toHaveBeenCalledWith('/partner/today?date=2026-09-21');
  });

  it('오늘이 아닌 날짜를 보고 있으면 "오늘로 이동" 버튼이 보이고, 누르면 오늘로 이동한다', () => {
    render(<DailyDateNav date="2026-09-25" todayDate="2026-09-20" />);
    fireEvent.click(screen.getByText('오늘로 이동'));
    expect(pushMock).toHaveBeenCalledWith('/partner/today?date=2026-09-20');
  });

  it('오늘 날짜를 보고 있으면 "오늘로 이동" 버튼이 보이지 않는다', () => {
    render(<DailyDateNav date="2026-09-20" todayDate="2026-09-20" />);
    expect(screen.queryByText('오늘로 이동')).not.toBeInTheDocument();
  });

  it('날짜 입력을 바꾸면 그 날짜로 이동한다', () => {
    render(<DailyDateNav date="2026-09-20" todayDate="2026-09-20" />);
    fireEvent.change(screen.getByLabelText('날짜 선택'), { target: { value: '2026-10-01' } });
    expect(pushMock).toHaveBeenCalledWith('/partner/today?date=2026-10-01');
  });
});
