import { afterEach, describe, expect, it, vi } from 'vitest';

// [나드리픽 파트너 PMS — 네이버 예약 인바운드 웹훅](2026-09-20 사용자 지시): 시크릿
// 토큰 검증, 필수 필드 검증, spot_id → partner_id 조회, bookings insert(source/
// status 고정, 시간 정규화)를 검증한다. spot-curations/route.test.ts와 동일한
// 관례 — vi.doMock + 동적 import('./route')로 매 테스트마다 새 모듈을 불러온다.
const VALID_BODY = {
  spot_id: 'spot-1',
  customer_name: '김손님',
  customer_phone: '010-1234-5678',
  booking_date: '2026-09-25',
  booking_time: '14:30',
  headcount: 4,
  memo: '창가 자리 부탁드려요',
};

function makeRequest(body: unknown, headers: Record<string, string> = { authorization: 'Bearer test-secret' }) {
  return new Request('http://localhost/api/webhook/naver-booking', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function mockAdminClient({
  partner = { id: 'partner-1' } as { id: string } | null,
  partnerError = null as { message: string } | null,
  insertResult = { id: 'booking-1' } as { id: string } | null,
  insertError = null as { message: string } | null,
}: {
  partner?: { id: string } | null;
  partnerError?: { message: string } | null;
  insertResult?: { id: string } | null;
  insertError?: { message: string } | null;
} = {}) {
  const insertMock = vi.fn(() => ({
    select: () => ({ single: () => Promise.resolve({ data: insertResult, error: insertError }) }),
  }));
  const partnerEqMock = vi.fn(() => ({ maybeSingle: () => Promise.resolve({ data: partner, error: partnerError }) }));
  const fromMock = vi.fn((table: string) => {
    if (table === 'partners') return { select: () => ({ eq: partnerEqMock }) };
    if (table === 'bookings') return { insert: insertMock };
    throw new Error(`unexpected table: ${table}`);
  });
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));
  return { fromMock, insertMock, partnerEqMock };
}

describe('POST /api/webhook/naver-booking', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('NAVER_BOOKING_WEBHOOK_SECRET이 설정돼 있지 않으면 500을 반환한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', '');
    mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_BODY) as never);
    expect(res.status).toBe(500);
  });

  it('Authorization 헤더가 없으면 401을 반환한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_BODY, {}) as never);
    expect(res.status).toBe(401);
  });

  it('시크릿 토큰이 틀리면 401을 반환한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_BODY, { authorization: 'Bearer wrong-secret' }) as never);
    expect(res.status).toBe(401);
  });

  it('JSON으로 파싱할 수 없는 본문이면 400을 반환한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest('이건 JSON이 아닙니다') as never);
    expect(res.status).toBe(400);
  });

  it.each([
    ['spot_id', { ...VALID_BODY, spot_id: '' }],
    ['customer_name', { ...VALID_BODY, customer_name: '' }],
    ['customer_phone', { ...VALID_BODY, customer_phone: '' }],
    ['booking_date', { ...VALID_BODY, booking_date: '2026/09/25' }],
    ['booking_time', { ...VALID_BODY, booking_time: '14시30분' }],
    ['headcount(0)', { ...VALID_BODY, headcount: 0 }],
    ['headcount(소수)', { ...VALID_BODY, headcount: 1.5 }],
  ])('%s가 유효하지 않으면 400을 반환하고 DB를 건드리지 않는다', async (_field, body) => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    const { fromMock } = mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest(body) as never);
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('spot_id에 매칭되는 파트너가 없으면 404를 반환한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient({ partner: null });
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_BODY) as never);
    expect(res.status).toBe(404);
  });

  it('파트너 조회 자체가 실패하면 500을 반환한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient({ partnerError: { message: 'DB 오류' } });
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_BODY) as never);
    expect(res.status).toBe(500);
  });

  it('정상 요청이면 partner_id를 채워 source=naver/status=confirmed로 insert하고 200을 반환한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    const { insertMock } = mockAdminClient();
    const { POST } = await import('./route');

    const res = await POST(makeRequest(VALID_BODY) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, booking_id: 'booking-1' });
    expect(insertMock).toHaveBeenCalledWith({
      partner_id: 'partner-1',
      customer_name: '김손님',
      customer_phone: '010-1234-5678',
      booking_date: '2026-09-25',
      booking_time: '14:30:00',
      headcount: 4,
      source: 'naver',
      status: 'confirmed',
      memo: '창가 자리 부탁드려요',
    });
  });

  it('memo가 없으면 null로 저장한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    const { insertMock } = mockAdminClient();
    const { POST } = await import('./route');

    const { memo: _memo, ...bodyWithoutMemo } = VALID_BODY;
    await POST(makeRequest(bodyWithoutMemo) as never);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ memo: null }));
  });

  it('booking_time에 이미 초 단위가 있으면 그대로 사용한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    const { insertMock } = mockAdminClient();
    const { POST } = await import('./route');

    await POST(makeRequest({ ...VALID_BODY, booking_time: '14:30:00' }) as never);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ booking_time: '14:30:00' }));
  });

  it('예약 저장이 실패하면 500을 반환한다', async () => {
    vi.stubEnv('NAVER_BOOKING_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient({ insertError: { message: 'DB 오류' } });
    const { POST } = await import('./route');
    const res = await POST(makeRequest(VALID_BODY) as never);
    expect(res.status).toBe(500);
  });
});
