import { afterEach, describe, expect, it, vi } from 'vitest';

// [나드리픽 파트너 PMS — 클라우드플레어 인바운드 메일 연동](2026-09-21 사용자
// 지시): 시크릿 검증, to/token으로부터 inbound_token 추출, 파트너 역조회, 메일
// 본문 파싱 실패 처리, bookings insert(source/status 고정)를 검증한다. 기존
// naver-booking 웹훅 테스트와 동일한 관례(vi.doMock + 동적 import).
const VALID_TEXT_BODY = ['예약자명: 김손님', '연락처: 010-1234-5678', '예약날짜: 2026-09-25', '예약시간: 14:30', '인원: 4명'].join(
  '\n'
);

function makeRequest(body: unknown, headers: Record<string, string> = { authorization: 'Bearer test-secret' }) {
  return new Request('http://localhost/api/webhook/email-inbound', {
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

describe('POST /api/webhook/email-inbound', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('EMAIL_INBOUND_WEBHOOK_SECRET이 설정돼 있지 않으면 500을 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', '');
    mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ to: 'abc123@inbound.example.com', text: VALID_TEXT_BODY }) as never);
    expect(res.status).toBe(500);
  });

  it('시크릿 토큰이 없거나 틀리면 401을 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient();
    const { POST } = await import('./route');

    const noAuth = await POST(makeRequest({ to: 'abc123@inbound.example.com', text: VALID_TEXT_BODY }, {}) as never);
    expect(noAuth.status).toBe(401);

    const wrongAuth = await POST(
      makeRequest({ to: 'abc123@inbound.example.com', text: VALID_TEXT_BODY }, { authorization: 'Bearer wrong' }) as never
    );
    expect(wrongAuth.status).toBe(401);
  });

  it('JSON으로 파싱할 수 없는 본문이면 400을 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest('이건 JSON이 아닙니다') as never);
    expect(res.status).toBe(400);
  });

  it('token도 to도 없으면 400을 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ text: VALID_TEXT_BODY }) as never);
    expect(res.status).toBe(400);
  });

  it('text도 html도 없으면 400을 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ to: 'abc123@inbound.example.com' }) as never);
    expect(res.status).toBe(400);
  });

  it('to의 로컬파트를 inbound_token으로 써서 파트너를 조회한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    const { partnerEqMock } = mockAdminClient();
    const { POST } = await import('./route');
    await POST(makeRequest({ to: 'abc123def456@inbound.example.com', text: VALID_TEXT_BODY }) as never);
    expect(partnerEqMock).toHaveBeenCalledWith('inbound_token', 'abc123def456');
  });

  it('token이 직접 오면 to보다 우선한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    const { partnerEqMock } = mockAdminClient();
    const { POST } = await import('./route');
    await POST(
      makeRequest({ token: 'explicit-token', to: 'ignored@inbound.example.com', text: VALID_TEXT_BODY }) as never
    );
    expect(partnerEqMock).toHaveBeenCalledWith('inbound_token', 'explicit-token');
  });

  it('매칭되는 파트너가 없으면 404를 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient({ partner: null });
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ to: 'nomatch@inbound.example.com', text: VALID_TEXT_BODY }) as never);
    expect(res.status).toBe(404);
  });

  it('파트너 조회 자체가 실패하면 500을 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient({ partnerError: { message: 'DB 오류' } });
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ to: 'abc123@inbound.example.com', text: VALID_TEXT_BODY }) as never);
    expect(res.status).toBe(500);
  });

  it('메일 본문에서 예약 정보를 추출하지 못하면 422를 반환하고 DB에 저장하지 않는다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    const { insertMock } = mockAdminClient();
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ to: 'abc123@inbound.example.com', text: '알 수 없는 내용입니다.' }) as never);
    expect(res.status).toBe(422);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('정상 요청이면 파싱 결과로 source=naver/status=confirmed를 채워 insert하고 200을 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    const { insertMock } = mockAdminClient();
    const { POST } = await import('./route');

    const res = await POST(makeRequest({ to: 'abc123@inbound.example.com', text: VALID_TEXT_BODY }) as never);
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
      memo: null,
    });
  });

  it('text가 없고 html만 있으면 태그를 걷어낸 뒤 파싱한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    const { insertMock } = mockAdminClient();
    const { POST } = await import('./route');

    const html = '<p>예약자명: 김손님</p><p>연락처: 010-1234-5678</p><p>예약날짜: 2026-09-25</p><p>예약시간: 14:30</p><p>인원: 4명</p>';
    const res = await POST(makeRequest({ to: 'abc123@inbound.example.com', html }) as never);
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ customer_name: '김손님' }));
  });

  it('예약 저장이 실패하면 500을 반환한다', async () => {
    vi.stubEnv('EMAIL_INBOUND_WEBHOOK_SECRET', 'test-secret');
    mockAdminClient({ insertError: { message: 'DB 오류' } });
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ to: 'abc123@inbound.example.com', text: VALID_TEXT_BODY }) as never);
    expect(res.status).toBe(500);
  });
});
