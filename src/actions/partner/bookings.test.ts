import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateBookingStatus } from './bookings';

const getUserMock = vi.fn();
const eqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ update: updateMock }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser: getUserMock }, from: fromMock }),
}));

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): 상태값 검증, 로그인 확인,
// RLS에 위임한 업데이트(수동 partner_id 필터 없이 .eq('id', bookingId)만 호출하는지)
// 를 검증한다.
describe('updateBookingStatus', () => {
  afterEach(() => {
    getUserMock.mockReset();
    eqMock.mockReset();
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('허용되지 않은 status면 로그인 확인 없이 에러를 반환한다', async () => {
    const result = await updateBookingStatus('booking-1', 'unknown' as never);
    expect(result).toEqual({ error: expect.stringContaining('status는 다음 중 하나여야 합니다') });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 에러를 반환하고 bookings를 건드리지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await updateBookingStatus('booking-1', 'completed');
    expect(result).toEqual({ error: '로그인이 필요합니다.' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인했으면 bookings.id로만 update를 호출한다(RLS가 소유권을 강제)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    eqMock.mockResolvedValue({ error: null });

    const result = await updateBookingStatus('booking-1', 'noshow');

    expect(result).toEqual({ success: true });
    expect(fromMock).toHaveBeenCalledWith('bookings');
    expect(updateMock).toHaveBeenCalledWith({ status: 'noshow' });
    expect(eqMock).toHaveBeenCalledWith('id', 'booking-1');
  });

  it('DB 업데이트가 실패하면 에러 메시지를 반환한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    eqMock.mockResolvedValue({ error: { message: 'DB 오류' } });

    const result = await updateBookingStatus('booking-1', 'cancelled');
    expect(result).toEqual({ error: 'DB 오류' });
  });
});
