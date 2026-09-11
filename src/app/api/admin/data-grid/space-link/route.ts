import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [개선사항10](2026-09-11 사용자 지시, implementation/todo.md): "이벤트 수집 시 장소
// 매칭 로직을 두어... 매칭되는 스팟이 없는 경우 관리자가 수동으로 스팟을 지정하거나
// 신규 등록하여 연결할 수 있도록 관리자 툴 플로우를 지원". `events.space_id`는 이미
// 존재하는 FK 컬럼이다(project/database_schema.md 3.2, `events_space_id_fkey` →
// open_spaces(id) ON DELETE SET NULL) — 신규 컬럼을 추가하지 않고 그대로 재사용한다
// (제5장 제4조 기존 구조 우선). location.ts PATCH 라우트와 동일한 관례(id 필수,
// service_role로 갱신).

// [연결된 스팟의 노출 중분류 확인](2026-09-12 사용자 지시): "이벤트픽에 스팟 연결하면
// 연결됨이라고 뜨는데.. 해당 장소가 노출 중분류가 있는지 확인하고 알려줘" — SpotPicker는
// {id, name, address}만 알고 있어 service_category_id를 모른다. 이 라우트가 이미 events↔
// open_spaces 연결을 다루므로 새 엔드포인트를 만들지 않고 GET을 추가해 연결된 open_spaces
// 행의 이름/노출 중분류를 함께 조회한다(제5장 제4조 기존 구조 우선).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('space_id');
    if (!spaceId) {
      return NextResponse.json({ error: 'space_id가 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('open_spaces')
      .select('id, name, standard_name, service_category_id')
      .eq('id', spaceId)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ space: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '연결된 스팟 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, space_id: spaceId } = body as { id?: unknown; space_id?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    // null이면 연결 해제(수동으로 "연결 안 함"을 선택한 경우).
    if (spaceId !== null && (typeof spaceId !== 'string' || !spaceId)) {
      return NextResponse.json({ error: 'space_id는 문자열이거나 null이어야 합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .update({ space_id: spaceId })
      .eq('id', id)
      .select('id, space_id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '연결된 스팟 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
