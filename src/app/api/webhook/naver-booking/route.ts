import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [나드리픽 파트너 PMS — 네이버 예약 인바운드 웹훅](2026-09-20 사용자 지시,
// docs/partner_spec.md 6절): "네이버 예약 알림 이메일 데이터를 실시간 수신 및
// 파싱하여 마스터 캘린더 DB에 통합 적재". 네이버 예약 자체가 임의의 제3자
// URL로 웹훅을 직접 보내는 공식 기능을 제공하지 않아(실측 불가 — 실제로 존재하는
// 외부 스펙이 없음), 이 라우트가 받는 JSON 페이로드 형태는 이번에 새로 정의한
// 계약이다: 별도의 메일 파싱 봇/릴레이 서비스가 이 형태로 변환해 보내는 것을
// 전제로 한다(추측 없이, 이미 이 프로젝트의 bookings 컬럼명/CreateBooking 서버
// 액션 입력과 동일한 필드명을 그대로 써서 일관성을 유지했다).
//
// [보안](요구사항 3) 요청 헤더 `Authorization: Bearer <NAVER_BOOKING_WEBHOOK_SECRET>`
// 로 검증한다. 이 요청은 로그인 세션이 없는 서버 대 서버 호출이라 세션 클라이언트가
// 아니라 service_role(createAdminClient)로 partners/bookings에 접근한다 — 시크릿
// 검증이 곧 이 라우트의 유일한 인증 수단이므로 그 검증을 반드시 먼저 통과시켜야
// DB에 손을 댄다.
const WEEKDAY_TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isBlankString(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.NAVER_BOOKING_WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.error('[webhook/naver-booking] NAVER_BOOKING_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.');
      return NextResponse.json({ error: '서버 설정 오류로 요청을 처리할 수 없습니다.' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    if (!providedSecret || providedSecret !== expectedSecret) {
      console.error('[webhook/naver-booking] 인증 실패 — Authorization 헤더의 토큰이 올바르지 않습니다.');
      return NextResponse.json({ error: '인증에 실패했습니다.' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '요청 본문을 JSON으로 해석할 수 없습니다.' }, { status: 400 });
    }

    const { spot_id, customer_name, customer_phone, booking_date, booking_time, headcount, memo } = body;

    // [데이터 파싱 및 매핑](요구사항 2): 필수 필드 검증 — 하나라도 빠지면 애매하게
    // 추측해 채우지 않고 명확한 400과 함께 어떤 필드가 문제인지 알려준다.
    if (isBlankString(spot_id)) return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    if (isBlankString(customer_name)) return NextResponse.json({ error: 'customer_name은 필수입니다.' }, { status: 400 });
    if (isBlankString(customer_phone)) return NextResponse.json({ error: 'customer_phone은 필수입니다.' }, { status: 400 });
    if (typeof booking_date !== 'string' || !DATE_PATTERN.test(booking_date)) {
      return NextResponse.json({ error: 'booking_date는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 });
    }
    if (typeof booking_time !== 'string' || !WEEKDAY_TIME_PATTERN.test(booking_time)) {
      return NextResponse.json({ error: 'booking_time은 HH:MM(:SS) 형식이어야 합니다.' }, { status: 400 });
    }
    const parsedHeadcount = Number(headcount);
    if (!Number.isInteger(parsedHeadcount) || parsedHeadcount < 1) {
      return NextResponse.json({ error: 'headcount는 1 이상의 정수여야 합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // [멀티 테넌시 대응](요구사항 3): "수신된 농장 식별 정보를 바탕으로 해당
    // 파트너의 partner_id를 조회" — partners.spot_id(온보딩 때 연동한 메인
    // 플랫폼 스팟)로 역참조한다.
    const { data: partner, error: partnerError } = await admin
      .from('partners')
      .select('id')
      .eq('spot_id', spot_id as string)
      .maybeSingle();

    if (partnerError) {
      console.error('[webhook/naver-booking] 파트너 조회 실패:', partnerError.message);
      return NextResponse.json({ error: '파트너 조회 중 오류가 발생했습니다.' }, { status: 500 });
    }
    if (!partner) {
      console.error('[webhook/naver-booking] 매칭되는 파트너를 찾지 못했습니다 — spot_id:', spot_id);
      return NextResponse.json({ error: '이 spot_id에 연동된 파트너를 찾을 수 없습니다.' }, { status: 404 });
    }

    const normalizedTime = booking_time.length === 5 ? `${booking_time}:00` : booking_time;

    const { data: inserted, error: insertError } = await admin
      .from('bookings')
      .insert({
        partner_id: partner.id,
        customer_name: (customer_name as string).trim(),
        customer_phone: (customer_phone as string).trim(),
        booking_date,
        booking_time: normalizedTime,
        headcount: parsedHeadcount,
        // [요구사항 2] source/status는 항상 이 값으로 고정한다 — 네이버 예약
        // 경로로 들어온 확정 건이라는 뜻이라 다른 값이 들어올 여지가 없다.
        source: 'naver',
        status: 'confirmed',
        memo: typeof memo === 'string' && memo.trim() ? memo.trim() : null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[webhook/naver-booking] 예약 저장 실패:', insertError.message);
      return NextResponse.json({ error: '예약 저장에 실패했습니다.' }, { status: 500 });
    }

    console.log('[webhook/naver-booking] 예약 저장 성공 — booking_id:', inserted.id, 'partner_id:', partner.id);
    return NextResponse.json({ success: true, booking_id: inserted.id }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    console.error('[webhook/naver-booking] 처리 중 예외 발생:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
