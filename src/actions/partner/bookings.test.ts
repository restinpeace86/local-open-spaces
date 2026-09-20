import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBooking, updateBookingStatus } from './bookings';

const getUserMock = vi.fn();
const eqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ update: updateMock, insert: insertMock }));
const revalidatePathMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser: getUserMock }, from: fromMock }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): 상태값 검증, 로그인 확인,
// RLS에 위임한 업데이트(수동 partner_id 필터 없이 .eq('id', bookingId)만 호출하는지)
// 를 검증한다.
describe('updateBookingStatus', () => {
  afterEach(() => {
    getUserMock.mockReset();
    eqMock.mockReset();
    updateMock.mockClear();
    insertMock.mockReset();
    fromMock.mockClear();
    revalidatePathMock.mockReset();
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

const VALID_BOOKING_INPUT = {
  customer_name: '김손님',
  customer_phone: '010-1234-5678',
  booking_date: '2026-09-20',
  booking_time: '14:30',
  headcount: 4,
  memo: '유모차 있어요',
};

// [나드리픽 파트너 PMS — 수기 예약 등록](2026-09-20 사용자 지시): 필수값 검증,
// 로그인 확인, partner_id 자동 주입(auth.uid()), source='nadripik'/status='confirmed'
// 고정, 성공 시 /partner/today revalidate를 검증한다.
describe('createBooking', () => {
  afterEach(() => {
    getUserMock.mockReset();
    insertMock.mockReset();
    fromMock.mockClear();
    revalidatePathMock.mockReset();
  });

  it.each([
    ['customer_name', { ...VALID_BOOKING_INPUT, customer_name: '  ' }, '예약자명을 입력해 주세요.'],
    ['customer_phone', { ...VALID_BOOKING_INPUT, customer_phone: '' }, '연락처를 입력해 주세요.'],
    ['booking_date', { ...VALID_BOOKING_INPUT, booking_date: '2026/09/20' }, '예약 날짜를 선택해 주세요.'],
    ['booking_time', { ...VALID_BOOKING_INPUT, booking_time: '14시30분' }, '예약 시간을 선택해 주세요.'],
    ['headcount(0)', { ...VALID_BOOKING_INPUT, headcount: 0 }, '방문 인원은 1명 이상이어야 합니다.'],
    ['headcount(소수)', { ...VALID_BOOKING_INPUT, headcount: 1.5 }, '방문 인원은 1명 이상이어야 합니다.'],
  ])('%s가 유효하지 않으면 로그인 확인 없이 검증 에러를 반환한다', async (_field, input, expectedError) => {
    const result = await createBooking(input);
    expect(result).toEqual({ error: expectedError });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 에러를 반환하고 bookings를 건드리지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await createBooking(VALID_BOOKING_INPUT);
    expect(result).toEqual({ error: '로그인이 필요합니다.' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인한 유저의 auth.uid()를 partner_id로 자동 주입하고, source/status를 고정해 insert한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertMock.mockResolvedValue({ error: null });

    const result = await createBooking(VALID_BOOKING_INPUT);

    expect(result).toEqual({ success: true });
    expect(fromMock).toHaveBeenCalledWith('bookings');
    expect(insertMock).toHaveBeenCalledWith({
      partner_id: 'user-1',
      customer_name: '김손님',
      customer_phone: '010-1234-5678',
      booking_date: '2026-09-20',
      booking_time: '14:30:00',
      headcount: 4,
      source: 'nadripik',
      status: 'confirmed',
      memo: '유모차 있어요',
    });
  });

  it('메모가 없으면 null로 저장한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertMock.mockResolvedValue({ error: null });

    await createBooking({ ...VALID_BOOKING_INPUT, memo: null });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ memo: null }));
  });

  it('저장에 성공하면 /partner/today를 revalidate한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertMock.mockResolvedValue({ error: null });

    await createBooking(VALID_BOOKING_INPUT);
    expect(revalidatePathMock).toHaveBeenCalledWith('/partner/today');
  });

  it('DB insert가 실패하면 에러 메시지를 반환하고 revalidate하지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertMock.mockResolvedValue({ error: { message: 'DB 오류' } });

    const result = await createBooking(VALID_BOOKING_INPUT);
    expect(result).toEqual({ error: 'DB 오류' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
