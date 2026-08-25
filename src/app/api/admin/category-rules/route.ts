import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [카테고리 정제 & 어드민 확장](2026-08-26): "[+ 키워드 추가] / [삭제]" 기능이 쓰는 CRUD
// 엔드포인트. 조회는 기존 관례대로 익명 키 클라이언트로 충분하지만(읽기), 추가/삭제는 이
// 앱에 아직 로그인 인증이 없어 서비스 롤 클라이언트를 쓴다(src/lib/supabase/admin.ts 참고).
type TargetTable = 'open_spaces' | 'events';

function isTargetTable(value: string | null): value is TargetTable {
  return value === 'open_spaces' || value === 'events';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetTable = searchParams.get('target_table');

  const supabase = await createClient();
  let query = supabase.from('category_rules').select('*').order('target_table').order('category_min').order('id');
  if (isTargetTable(targetTable)) query = query.eq('target_table', targetTable);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const targetTable = body.target_table;
    const categoryMin = typeof body.category_min === 'string' ? body.category_min.trim() : '';
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    const isExclude = body.is_exclude === true;

    if (!isTargetTable(targetTable)) {
      return NextResponse.json({ error: 'target_table은 open_spaces 또는 events여야 합니다.' }, { status: 400 });
    }
    if (!categoryMin || !keyword) {
      return NextResponse.json({ error: 'category_min과 keyword는 필수입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('category_rules')
      .insert({ target_table: targetTable, category_min: categoryMin, keyword, is_exclude: isExclude })
      .select()
      .single();

    if (error) {
      // unique 제약 위반(이미 등록된 키워드) 등도 여기로 온다 — 사용자에게 그대로 알려준다.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rule: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '키워드 규칙 추가 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'id 파라미터가 필요합니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('category_rules').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
