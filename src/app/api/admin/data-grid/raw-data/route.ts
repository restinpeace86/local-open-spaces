import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// [관리자화면 프론트엔드 렌더링 지연 진단](2026-09-12 사용자 지시): "데이터를
// 가져오는게 크게 없는데?" — 실측 결과 목록 조회가 raw_data(JSONB) 전체를 매 행
// 실어 날랐는데(그리드 행은 안 쓰거나 그중 3개 필드만 씀) 상세 모달을 열 때만
// 실제로 필요했다. 목록 조회(/api/admin/data-grid)에서 raw_data를 빼는 대신,
// 행을 열 때 이 라우트로 그 한 건의 raw_data만 따로 받아온다
// (data-grid-client.tsx의 handleOpenDataRow가 호출).
type TargetTable = 'open_spaces' | 'events';

function isTargetTable(value: unknown): value is TargetTable {
  return value === 'open_spaces' || value === 'events';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table');
    const id = searchParams.get('id');

    if (!isTargetTable(table)) {
      return NextResponse.json({ error: 'table은 open_spaces 또는 events여야 합니다.' }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from(table).select('raw_data').eq('id', id).single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ raw_data: data?.raw_data ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'raw_data 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
