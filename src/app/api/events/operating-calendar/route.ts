import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeOperatingDates } from '@/lib/spaces/event-operating-schedule';

// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2]): 유저 상세 화면이 "기간 전체 중 실제로 여는 날짜"만 계산해 받을 수
// 있는 공개 조회 전용 라우트. 운영 요일 규칙(operating_weekdays 등)과 예외일
// (event_operating_exceptions)은 관리자 전용 테이블/컬럼이라 그대로 노출하지 않고,
// 이미 계산된 날짜 배열만 반환한다(제5장 제4조 — 판정 로직을 클라이언트에 중복시키지
// 않고 서버가 한 번만 계산). event_operating_exceptions는 RLS만 켜두고 정책을 전혀
// 추가하지 않은 테이블(event_price_verifications와 동일 관례)이라, 이 라우트는 공개
// 라우트여도 anon 클라이언트로는 그 테이블을 읽을 수 없다 — service_role(admin
// 클라이언트)로 조회한 뒤 안전한 결과(날짜 배열)만 추려 응답한다.
export async function GET(request: NextRequest) {
  try {
    const eventId = new URL(request.url).searchParams.get('event_id');
    if (!eventId) return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const [{ data: event, error: eventError }, { data: exceptions, error: exceptionError }] = await Promise.all([
      admin
        .from('events')
        .select('start_date, end_date, operating_weekdays, excluded_weekdays, operating_nth_weekdays')
        .eq('id', eventId)
        .single(),
      admin.from('event_operating_exceptions').select('exception_date, note').eq('event_id', eventId),
    ]);
    if (eventError) throw new Error(eventError.message);
    if (exceptionError) throw new Error(exceptionError.message);
    if (!event?.start_date || !event?.end_date) {
      return NextResponse.json({ error: '이 이벤트는 운영 기간(start_date/end_date) 정보가 없습니다.' }, { status: 404 });
    }

    const openDates = computeOperatingDates({
      schedule: {
        operating_weekdays: event.operating_weekdays,
        excluded_weekdays: event.excluded_weekdays,
        operating_nth_weekdays: event.operating_nth_weekdays,
      },
      exceptionDates: (exceptions ?? []).map((row) => row.exception_date),
      startDate: event.start_date,
      endDate: event.end_date,
    });

    return NextResponse.json({
      startDate: event.start_date,
      endDate: event.end_date,
      openDates,
      exceptions: (exceptions ?? []).map((row) => ({ date: row.exception_date, note: row.note })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '운영일 캘린더 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
