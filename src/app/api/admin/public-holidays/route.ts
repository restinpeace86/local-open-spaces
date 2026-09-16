import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2]): "관리자가 연간 예외 공휴일 등을 수동으로 관리할 수 있는 최소한의
// 테이블 구조 제안. -> 해당 테이블로 공휴일 데이터 가져올 수 있는 원천 데이터
// 소스 수집도 필요.. 연1회면 되니 수동으로 관리자가 하도록 함"
//
// [실측 확인 — 자동 수집 API는 이번 범위에서 보류함] 한국천문연구원 특일 정보
// (SpcdeInfoService, data.go.kr)로 실제 호출을 시도했으나 이 프로젝트의
// PUBLIC_DATA_API_KEY는 이 서비스에 대해 "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"
// (HTTP 403)를 반환했다 — data.go.kr은 서비스마다 별도 활용신청 승인이 필요해서,
// 계정 소유자가 data.go.kr 콘솔에서 이 서비스를 직접 신청해야만 호출 가능하다(구현
// AI가 대신 등록할 수 없음). 등록이 안 된 상태로 자동 호출 기능을 만들면 항상
// 같은 에러로 실패하는 죽은 기능이 되고, 실제 응답 스키마도 검증하지 못한 채
// 추측으로 파싱 로직을 짜는 셈이라(제3장 제5조 추측 금지) 이번에는 구현하지
// 않았다 — 대신 관리자가 공휴일 이름/날짜를 직접 입력하는 이 CRUD로 "수동으로
// 관리"하는 대안 경로를 제공한다(요구사항 원문의 "또는 예외 처리 방식" 허용
// 범위). 서비스가 등록되면 이 라우트에 자동 수집 POST를 추가하기만 하면 된다.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const year = new URL(request.url).searchParams.get('year');
    const admin = createAdminClient();
    let query = admin.from('public_holidays').select('holiday_date, name').order('holiday_date', { ascending: true });
    if (year && /^\d{4}$/.test(year)) {
      query = query.gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '공휴일 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { holiday_date?: unknown; name?: unknown };
    const holidayDate = typeof body.holiday_date === 'string' ? body.holiday_date : null;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!holidayDate || !DATE_RE.test(holidayDate)) {
      return NextResponse.json({ error: 'holiday_date는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: 'name(공휴일 이름)이 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('public_holidays')
      .upsert({ holiday_date: holidayDate, name }, { onConflict: 'holiday_date' })
      .select('holiday_date, name')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '공휴일 추가 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const holidayDate = new URL(request.url).searchParams.get('holiday_date');
    if (!holidayDate) return NextResponse.json({ error: 'holiday_date가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('public_holidays').delete().eq('holiday_date', holidayDate);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '공휴일 삭제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
