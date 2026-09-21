import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingCard, BookingCardData } from './booking-card';

const updateBookingStatusMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/actions/partner/bookings', async () => {
  const actual = await vi.importActual<typeof import('@/actions/partner/bookings')>('@/actions/partner/bookings');
  return { ...actual, updateBookingStatus: (id: string, status: string) => updateBookingStatusMock(id, status) };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const BASE_BOOKING: BookingCardData = {
  id: 'booking-1',
  customer_name: '김손님',
  customer_phone: '010-1111-2222',
  booking_time: '14:30:00',
  headcount: 4,
  source: 'naver',
  status: 'confirmed',
  memo: '유모차 있어요',
  product_name: null,
  total_price: null,
};

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): 채널 뱃지, 핵심 정보
// 표시, tel: 링크, 상태 변경(즉시 반영 + 실패 시 롤백)을 검증한다.
describe('BookingCard', () => {
  afterEach(() => {
    updateBookingStatusMock.mockReset();
    refreshMock.mockReset();
  });

  it('예약자명/전화번호/시간/인원/메모를 표시한다', () => {
    render(<BookingCard booking={BASE_BOOKING} />);
    expect(screen.getByText('김손님')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'A' && el.textContent === '📞 010-1111-2222')).toBeInTheDocument();
    expect(screen.getByText('14:30')).toBeInTheDocument();
    expect(screen.getByText('4명')).toBeInTheDocument();
    expect(screen.getByText('유모차 있어요')).toBeInTheDocument();
  });

  it('source가 naver면 "네이버 예약" 뱃지를, manual이면 "수기 등록" 뱃지를 보여준다', () => {
    const { rerender } = render(<BookingCard booking={BASE_BOOKING} />);
    expect(screen.getByText('네이버 예약')).toBeInTheDocument();

    rerender(<BookingCard booking={{ ...BASE_BOOKING, source: 'manual' }} />);
    expect(screen.getByText('수기 등록')).toBeInTheDocument();
  });

  it('product_name/total_price가 있으면 상품명과 결제 금액을 표시한다', () => {
    render(<BookingCard booking={{ ...BASE_BOOKING, product_name: '스탠다드룸', total_price: 50000 }} />);
    expect(screen.getByText('스탠다드룸')).toBeInTheDocument();
    expect(screen.getByText('50,000원')).toBeInTheDocument();
  });

  it('product_name/total_price가 없으면 해당 영역을 표시하지 않는다', () => {
    render(<BookingCard booking={BASE_BOOKING} />);
    expect(screen.queryByText(/원$/)).not.toBeInTheDocument();
  });

  it('전화번호는 tel: 링크로 연결된다', () => {
    render(<BookingCard booking={BASE_BOOKING} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'tel:010-1111-2222');
  });

  it('상태 버튼을 누르면 즉시 활성 표시가 바뀌고 서버 액션을 호출한 뒤 router.refresh()한다', async () => {
    updateBookingStatusMock.mockResolvedValue({ success: true });
    render(<BookingCard booking={BASE_BOOKING} />);

    fireEvent.click(screen.getByText('완료'));
    // 클릭 즉시(비동기 응답 전) 낙관적으로 활성 표시가 바뀌어 버튼 라벨이 "처리 중..."으로 바뀐다.
    expect(screen.getByText('처리 중...').closest('button')).toHaveClass('bg-gray-900');

    await waitFor(() => expect(updateBookingStatusMock).toHaveBeenCalledWith('booking-1', 'completed'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('서버 액션이 실패하면 이전 상태로 되돌리고 에러 메시지를 보여준다', async () => {
    updateBookingStatusMock.mockResolvedValue({ error: '업데이트 실패' });
    render(<BookingCard booking={BASE_BOOKING} />);

    fireEvent.click(screen.getByText('노쇼'));
    await screen.findByText('업데이트 실패');
    // 확정(confirmed)이 다시 활성 상태로 돌아와 있어야 한다.
    expect(screen.getByText('확정').closest('button')).toHaveClass('bg-gray-900');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('이미 활성 상태인 버튼을 다시 눌러도 서버 액션을 호출하지 않는다', () => {
    render(<BookingCard booking={BASE_BOOKING} />);
    fireEvent.click(screen.getByText('확정'));
    expect(updateBookingStatusMock).not.toHaveBeenCalled();
  });
});
