import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [예약 오픈 알림](2026-09-20 사용자 지시): 이벤트 상세에서 "다음 예약 오픈 시각"이
// 있으면 알림 신청 버튼을 보여주기 위한 공개 조회 엔드포인트. spot-notices 라우트와
// 동일한 이유로 서비스 롤 클라이언트를 서버에서만 쓴다(제5장 제4조).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id')?.trim();
    if (!eventId) {
      return NextResponse.json({ error: 'event_id는 필수입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .select('next_reservation_open_at')
      .eq('id', eventId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ next_reservation_open_at: data?.next_reservation_open_at ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예약 오픈 시각 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
