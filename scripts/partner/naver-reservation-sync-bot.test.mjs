import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSessionCookies, upsertReservation } from './naver-reservation-sync-bot.mjs';

// [나드리픽 파트너 PMS — 네이버 예약 스태프 계정 동기화 봇](2026-09-21 사용자
// 지시): 이 파일은 "프로세스"(사용자가 중요하다고 확정한 부분) — 세션 쿠키
// 검증, 예약 upsert(멱등키/상태 매핑/알 수 없는 상태 폴백)만 검증한다. 실제
// 페이지 스크래핑(extractReservationsFromPage)은 아직 미구현(정직한 한계 고지,
// 헤더 주석 참고)이라 테스트 대상이 아니다.
describe('parseSessionCookies', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('환경변수가 없으면 에러를 던진다', () => {
    vi.stubEnv('NAVER_STAFF_SESSION_COOKIES_JSON', '');
    expect(() => parseSessionCookies()).toThrow(/NAVER_STAFF_SESSION_COOKIES_JSON/);
  });

  it('빈 배열이면 에러를 던진다', () => {
    vi.stubEnv('NAVER_STAFF_SESSION_COOKIES_JSON', '[]');
    expect(() => parseSessionCookies()).toThrow(/비어 있지 않은 배열/);
  });

  it('배열이 아니면 에러를 던진다', () => {
    vi.stubEnv('NAVER_STAFF_SESSION_COOKIES_JSON', '{"name":"NID_AUT"}');
    expect(() => parseSessionCookies()).toThrow(/비어 있지 않은 배열/);
  });

  it('유효한 쿠키 배열이면 그대로 파싱해 반환한다', () => {
    const cookies = [{ name: 'NID_AUT', value: 'abc', domain: '.naver.com', path: '/' }];
    vi.stubEnv('NAVER_STAFF_SESSION_COOKIES_JSON', JSON.stringify(cookies));
    expect(parseSessionCookies()).toEqual(cookies);
  });
});

describe('upsertReservation', () => {
  function makeAdminMock(upsertResult = { error: null }) {
    const upsertMock = vi.fn(() => Promise.resolve(upsertResult));
    const fromMock = vi.fn(() => ({ upsert: upsertMock }));
    return { from: fromMock, upsertMock, fromMock };
  }

  const RESERVATION = {
    naverReservationId: 'NAVER-1',
    customerName: '김손님',
    customerPhone: '010-1234-5678',
    bookingDate: '2026-09-25',
    bookingTime: '14:30:00',
    headcount: 4,
    statusLabel: '예약확정',
  };

  it('naver_reservation_id를 멱등키로 bookings에 upsert한다', async () => {
    const admin = makeAdminMock();
    const result = await upsertReservation(admin, 'partner-1', RESERVATION);

    expect(result).toBe(true);
    expect(admin.fromMock).toHaveBeenCalledWith('bookings');
    expect(admin.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partner_id: 'partner-1',
        naver_reservation_id: 'NAVER-1',
        customer_name: '김손님',
        customer_phone: '010-1234-5678',
        booking_date: '2026-09-25',
        booking_time: '14:30:00',
        headcount: 4,
        source: 'naver',
        status: 'confirmed',
      }),
      { onConflict: 'naver_reservation_id' }
    );
  });

  it('알 수 없는 상태 라벨은 confirmed로 안전하게 폴백한다', async () => {
    const admin = makeAdminMock();
    await upsertReservation(admin, 'partner-1', { ...RESERVATION, statusLabel: '처리중' });
    expect(admin.upsertMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }), expect.anything());
  });

  it('알려진 상태 라벨(취소)은 정확히 매핑한다', async () => {
    const admin = makeAdminMock();
    await upsertReservation(admin, 'partner-1', { ...RESERVATION, statusLabel: '취소' });
    expect(admin.upsertMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }), expect.anything());
  });

  it('upsert가 실패하면 false를 반환한다', async () => {
    const admin = makeAdminMock({ error: { message: 'DB 오류' } });
    const result = await upsertReservation(admin, 'partner-1', RESERVATION);
    expect(result).toBe(false);
  });
});
