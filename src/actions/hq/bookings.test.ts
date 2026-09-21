import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteBookingAsHq } from './bookings';

const getUserMock = vi.fn();
const adminEqMock = vi.fn();
const adminDeleteMock = vi.fn(() => ({ eq: adminEqMock }));
const adminFromMock = vi.fn(() => ({ delete: adminDeleteMock }));
const revalidatePathMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser: getUserMock } }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFromMock }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

const ORIGINAL_ENV = process.env.HQ_STAFF_EMAILS;

// [HQ 전체 파트너 데이터 열람/삭제 권한](2026-09-22 사용자 지시): HQ가 아닌 계정이
// bookingId만 알면 임의로 삭제할 수 있으면 안 되므로, "화이트리스트 밖 계정은 admin
// 클라이언트를 건드리기 전에 차단되는지"가 이 액션의 핵심 검증 대상이다.
describe('deleteBookingAsHq', () => {
  afterEach(() => {
    getUserMock.mockReset();
    adminEqMock.mockReset();
    adminDeleteMock.mockClear();
    adminFromMock.mockClear();
    revalidatePathMock.mockReset();
    process.env.HQ_STAFF_EMAILS = ORIGINAL_ENV;
  });

  it('로그인하지 않았으면 에러를 반환하고 admin 클라이언트를 건드리지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await deleteBookingAsHq('booking-1');
    expect(result).toEqual({ error: 'HQ 권한이 없습니다.' });
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it('로그인했지만 화이트리스트에 없는 이메일이면 에러를 반환하고 admin 클라이언트를 건드리지 않는다', async () => {
    process.env.HQ_STAFF_EMAILS = 'staff@example.com';
    getUserMock.mockResolvedValue({ data: { user: { email: 'random@example.com' } } });
    const result = await deleteBookingAsHq('booking-1');
    expect(result).toEqual({ error: 'HQ 권한이 없습니다.' });
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it('화이트리스트에 있는 이메일이면 admin 클라이언트로 삭제하고 /hq를 revalidate한다', async () => {
    process.env.HQ_STAFF_EMAILS = 'staff@example.com';
    getUserMock.mockResolvedValue({ data: { user: { email: 'staff@example.com' } } });
    adminEqMock.mockResolvedValue({ error: null });

    const result = await deleteBookingAsHq('booking-1');

    expect(result).toEqual({ success: true });
    expect(adminFromMock).toHaveBeenCalledWith('bookings');
    expect(adminEqMock).toHaveBeenCalledWith('id', 'booking-1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/hq');
  });

  it('DB 삭제가 실패하면 에러 메시지를 반환하고 revalidate하지 않는다', async () => {
    process.env.HQ_STAFF_EMAILS = 'staff@example.com';
    getUserMock.mockResolvedValue({ data: { user: { email: 'staff@example.com' } } });
    adminEqMock.mockResolvedValue({ error: { message: 'DB 오류' } });

    const result = await deleteBookingAsHq('booking-1');
    expect(result).toEqual({ error: 'DB 오류' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
