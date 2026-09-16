import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2]): 정기 요일 규칙(operating-schedule 라우트)만으로 표현할 수 없는
// 단발성 예외("올해 이 날만은 특별히 쉰다")를 이벤트별로 관리한다. GET/POST/DELETE
// 3개만 필요한 단순 CRUD라 event_price_verifications처럼 별도 라우트 파일로 뺀다
// (operating-schedule 라우트에 합치면 그쪽은 "단일 PATCH" 관례인데 이건 "여러 행"
// 관례라 성격이 다름).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const eventId = new URL(request.url).searchParams.get('event_id');
    if (!eventId) return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('event_operating_exceptions')
      .select('id, exception_date, note')
      .eq('event_id', eventId)
      .order('exception_date', { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예외일 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { event_id?: unknown; exception_date?: unknown; note?: unknown };
    const eventId = typeof body.event_id === 'string' ? body.event_id : null;
    const exceptionDate = typeof body.exception_date === 'string' ? body.exception_date : null;
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
    if (!eventId) return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });
    if (!exceptionDate || !DATE_RE.test(exceptionDate)) {
      return NextResponse.json({ error: 'exception_date는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('event_operating_exceptions')
      .upsert({ event_id: eventId, exception_date: exceptionDate, note }, { onConflict: 'event_id,exception_date' })
      .select('id, exception_date, note')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예외일 추가 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('event_operating_exceptions').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예외일 삭제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
