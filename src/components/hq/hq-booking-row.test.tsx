import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HqBookingRow, HqBookingRowData } from './hq-booking-row';

const deleteBookingAsHqMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/actions/hq/bookings', () => ({
  deleteBookingAsHq: (id: string) => deleteBookingAsHqMock(id),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const BASE_BOOKING: HqBookingRowData = {
  id: 'booking-1',
  customer_name: '김손님',
  customer_phone: '010-1111-2222',
  booking_date: '2026-09-22',
  booking_time: '14:30:00',
  headcount: 2,
  source: 'manual',
  status: 'confirmed',
  product_name: '스탠다드룸',
  total_price: 50000,
};

function renderRow(booking: HqBookingRowData = BASE_BOOKING) {
  return render(
    <table>
      <tbody>
        <HqBookingRow booking={booking} />
      </tbody>
    </table>
  );
}

describe('HqBookingRow', () => {
  afterEach(() => {
    deleteBookingAsHqMock.mockReset();
    refreshMock.mockReset();
    vi.restoreAllMocks();
  });

  it('예약 정보를 표에 표시한다', () => {
    renderRow();
    expect(screen.getByText('김손님')).toBeInTheDocument();
    expect(screen.getByText('010-1111-2222')).toBeInTheDocument();
    expect(screen.getByText('스탠다드룸')).toBeInTheDocument();
    expect(screen.getByText('50,000원')).toBeInTheDocument();
    expect(screen.getByText('확정')).toBeInTheDocument();
  });

  it('confirm에서 취소하면 삭제 액션을 호출하지 않는다', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderRow();
    fireEvent.click(screen.getByText('삭제'));
    expect(deleteBookingAsHqMock).not.toHaveBeenCalled();
  });

  it('confirm에서 확인하면 삭제 액션을 호출하고 성공 시 행이 사라지며 router.refresh()된다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteBookingAsHqMock.mockResolvedValue({ success: true });
    renderRow();

    fireEvent.click(screen.getByText('삭제'));

    await waitFor(() => expect(deleteBookingAsHqMock).toHaveBeenCalledWith('booking-1'));
    await waitFor(() => expect(screen.queryByText('김손님')).not.toBeInTheDocument());
    expect(refreshMock).toHaveBeenCalled();
  });

  it('삭제 액션이 실패하면 에러 메시지를 보여주고 행을 유지한다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteBookingAsHqMock.mockResolvedValue({ error: 'HQ 권한이 없습니다.' });
    renderRow();

    fireEvent.click(screen.getByText('삭제'));

    expect(await screen.findByText('HQ 권한이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('김손님')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
