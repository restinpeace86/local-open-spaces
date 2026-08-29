import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시): 공식 홈페이지가 없는
// 스팟(open_spaces)을 위한 자체 신청 접수 엔드포인트. reservations 테이블은 RLS가
// 켜져 있고 정책이 없어(scripts/migrations/2026-08-29-create-reservations-table.sql)
// anon 키로는 삽입할 수 없다 — category-rules API와 동일하게 서비스 롤 클라이언트를
// 서버에서만 쓴다.
const CONTACT_MAX_LENGTH = 50;

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const spotId = typeof body.spot_id === 'string' ? body.spot_id.trim() : '';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
    const visitDate = typeof body.visit_date === 'string' ? body.visit_date.trim() : '';
    const headcount = Number(body.headcount);

    if (!spotId) {
      return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    }
    if (!contact) {
      return NextResponse.json({ error: '연락처를 입력해 주세요.' }, { status: 400 });
    }
    if (contact.length > CONTACT_MAX_LENGTH) {
      return NextResponse.json({ error: `연락처는 ${CONTACT_MAX_LENGTH}자를 넘을 수 없습니다.` }, { status: 400 });
    }
    if (!isValidDateString(visitDate)) {
      return NextResponse.json({ error: '방문 날짜를 올바르게 선택해 주세요.' }, { status: 400 });
    }
    if (!Number.isInteger(headcount) || headcount < 1) {
      return NextResponse.json({ error: '인원 수는 1명 이상의 숫자여야 합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('reservations')
      .insert({ spot_id: spotId, contact, visit_date: visitDate, headcount })
      .select()
      .single();

    if (error) {
      // spot_id가 open_spaces에 실제로 존재하지 않는 경우(FK 위반) 등도 여기로 온다.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ reservation: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예약 신청 접수 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
