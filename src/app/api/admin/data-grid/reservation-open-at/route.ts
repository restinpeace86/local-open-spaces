import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [예약 오픈 알림](2026-09-20 사용자 지시): "사전예약 오픈일에 맞추어.. 앱 푸시 주는
// 기능" — 서울형키즈카페 등 예약 오픈 규칙이 자치구별 시차를 두고, 그 규칙 자체도
// 시기에 따라 바뀌는 것으로 확인돼(사용자가 두 시점의 서로 다른 공지문을 제시)
// 코드에 규칙을 하드코딩하지 않는다(제3장 제5조 추측 금지). 대신 관리자가 이벤트마다
// "다음 예약 오픈 시각"을 직접 입력·관리한다 — category-min/facility-type 등 기존
// 개별 필드 수동 수정 라우트와 동일한 패턴(제5장 제4조).
//
// 값을 바꾸면 reservation_open_reminder_sent_at을 함께 null로 되돌린다 — 발송
// 배치는 이 두 컬럼이 같은 값이면 "이미 이 회차를 보냈다"로 판단하므로, 관리자가
// 다음 주 시각으로 갱신할 때마다 자연히 다시 발송 대상이 된다.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, next_reservation_open_at: nextOpenAt } = body as { id?: unknown; next_reservation_open_at?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    let normalizedOpenAt: string | null = null;
    if (typeof nextOpenAt === 'string' && nextOpenAt.trim()) {
      const parsed = new Date(nextOpenAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'next_reservation_open_at이 올바른 날짜/시각이 아닙니다.' }, { status: 400 });
      }
      normalizedOpenAt = parsed.toISOString();
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .update({ next_reservation_open_at: normalizedOpenAt, reservation_open_reminder_sent_at: null })
      .eq('id', id)
      .select('id, next_reservation_open_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예약 오픈 시각 수동 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
