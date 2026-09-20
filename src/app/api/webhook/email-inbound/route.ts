import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseNaverReservationEmail } from '@/lib/partner/parse-naver-reservation-email';
import { stripHtml } from '@/lib/partner/strip-html';

// [나드리픽 파트너 PMS — 클라우드플레어 인바운드 메일 연동](2026-09-21 사용자
// 지시, docs/partner_spec.md 6절 "과거 데이터 이관" 취지의 실시간 버전): 클라우드
//플레어 Email Routing이 파트너 전용 인바운드 주소({inbound_token}@인바운드도메인)로
// 온 메일을 Worker로 받아 이 라우트로 포워딩한다고 가정한다.
//
// [페이로드 계약도 새로 정의함] naver-booking 웹훅과 동일한 이유(제3장 제5조
// 추측 금지, 하지만 검증할 실제 외부 스펙이 없음) — 클라우드플레어 Worker 스크립트
// 자체는 이번 범위 밖이라 그 스크립트가 이 형태로 POST한다고 전제한다:
//   { "to": "abc123@inbound.nadripik.com", "token"?: "abc123",
//     "text"?: "...", "html"?: "..." }
// token이 직접 오면 그걸 우선하고, 없으면 to의 로컬파트(@ 앞)를 토큰으로 쓴다.
//
// [인증](naver-booking 웹훅과 동일한 관례, 제5장 제4조): 이 요청도 세션 없는
// 서버 대 서버 호출이라 EMAIL_INBOUND_WEBHOOK_SECRET 공유 시크릿으로 "정말 우리
// Worker가 보낸 요청인지"를 먼저 확인한다 — 이건 "어느 파트너의 예약인지"를
// 구분하는 inbound_token과는 다른 층위의 검증이다(공유 시크릿=요청 출처 검증,
// inbound_token=테넌트 식별).
function extractTokenFromAddress(address: string): string | null {
  const localPart = address.split('@')[0]?.trim();
  return localPart || null;
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.error('[webhook/email-inbound] EMAIL_INBOUND_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.');
      return NextResponse.json({ error: '서버 설정 오류로 요청을 처리할 수 없습니다.' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    if (!providedSecret || providedSecret !== expectedSecret) {
      console.error('[webhook/email-inbound] 인증 실패 — Authorization 헤더의 토큰이 올바르지 않습니다.');
      return NextResponse.json({ error: '인증에 실패했습니다.' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '요청 본문을 JSON으로 해석할 수 없습니다.' }, { status: 400 });
    }

    const explicitToken = typeof body.token === 'string' ? body.token.trim() : null;
    const toAddress = typeof body.to === 'string' ? body.to.trim() : null;
    const inboundToken = explicitToken || (toAddress ? extractTokenFromAddress(toAddress) : null);
    if (!inboundToken) {
      return NextResponse.json({ error: 'token 또는 to(수신 주소)가 필요합니다.' }, { status: 400 });
    }

    const rawText = typeof body.text === 'string' && body.text.trim() ? body.text : null;
    const rawHtml = typeof body.html === 'string' && body.html.trim() ? body.html : null;
    const bodyText = rawText ?? (rawHtml ? stripHtml(rawHtml) : null);
    if (!bodyText) {
      return NextResponse.json({ error: '메일 본문(text 또는 html)이 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // [멀티 테넌시](요구사항 2): inbound_token으로 partner_id를 역조회한다.
    const { data: partner, error: partnerError } = await admin
      .from('partners')
      .select('id')
      .eq('inbound_token', inboundToken)
      .maybeSingle();

    if (partnerError) {
      console.error('[webhook/email-inbound] 파트너 조회 실패:', partnerError.message);
      return NextResponse.json({ error: '파트너 조회 중 오류가 발생했습니다.' }, { status: 500 });
    }
    if (!partner) {
      console.error('[webhook/email-inbound] 유효하지 않은 인바운드 토큰입니다:', inboundToken);
      return NextResponse.json({ error: '유효하지 않은 인바운드 토큰입니다.' }, { status: 404 });
    }

    // [메일 본문 파싱](요구사항 3): 한 항목이라도 확신 있게 못 뽑으면(parse-naver-
    // reservation-email.ts 참고) 추측하지 않고 실패시킨다.
    const parsed = parseNaverReservationEmail(bodyText);
    if (!parsed) {
      console.error('[webhook/email-inbound] 메일 본문에서 예약 정보를 추출하지 못했습니다. partner_id:', partner.id);
      return NextResponse.json({ error: '메일 본문에서 예약 정보를 추출하지 못했습니다.' }, { status: 422 });
    }

    const { data: inserted, error: insertError } = await admin
      .from('bookings')
      .insert({
        partner_id: partner.id,
        customer_name: parsed.customerName,
        customer_phone: parsed.customerPhone,
        booking_date: parsed.bookingDate,
        booking_time: `${parsed.bookingTime}:00`,
        headcount: parsed.headcount,
        source: 'naver',
        status: 'confirmed',
        memo: null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[webhook/email-inbound] 예약 저장 실패:', insertError.message);
      return NextResponse.json({ error: '예약 저장에 실패했습니다.' }, { status: 500 });
    }

    console.log('[webhook/email-inbound] 예약 저장 성공 — booking_id:', inserted.id, 'partner_id:', partner.id);
    return NextResponse.json({ success: true, booking_id: inserted.id }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    console.error('[webhook/email-inbound] 처리 중 예외 발생:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
