import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [이마트 컬처클럽 강좌 리스트 — 관리자 화면 노출](2026-10-03 사용자 지시):
// emart_culture_club_classes 테이블(서비스롤 전용 RLS)을 서비스롤 클라이언트로
// 조회한다. 전체 6,500건+ 규모라 PostgREST 기본 max-rows(1,000)에 걸리므로,
// 카테고리/상태 필터로 좁혀 쓰는 걸 전제로 한다 — total 필드로 실제 전체
// 건수(필터 적용 후)를 함께 내려줘 관리자가 "더 좁혀야 하는지" 판단할 수 있게 한다.
const ROWS_LIMIT = 1000;

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const subCategoryCode = searchParams.get('sub_category_code');
  const filterStatus = searchParams.get('filter_status');
  const storeCode = searchParams.get('store_code');

  let query = supabase
    .from('emart_culture_club_classes')
    .select('*', { count: 'exact' })
    .order('collected_at', { ascending: false })
    .limit(ROWS_LIMIT);

  if (subCategoryCode) query = query.eq('sub_category_code', subCategoryCode);
  if (filterStatus) query = query.eq('filter_status', filterStatus);
  if (storeCode) query = query.eq('store_code', storeCode);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}

// [수동 노출 제외](2026-10-03 사용자 지시): "화면에 노출 배제할꺼 수동으로
// 체크할수 있어? ... Club Original은 섞여있어서 어른께 더 많은편이야" — Club
// Originals 카테고리는 키즈 전용이 아니라 성인 강좌가 섞여 있어, 관리자가
// 리뷰하면서 개별 강좌를 노출 제외 처리할 수 있어야 한다.
export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();

  let body: { class_id?: string; is_excluded?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 });
  }

  const { class_id: classId, is_excluded: isExcluded } = body;
  if (!classId || typeof isExcluded !== 'boolean') {
    return NextResponse.json({ error: 'class_id와 is_excluded(boolean)가 필요합니다.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('emart_culture_club_classes')
    .update({ is_excluded: isExcluded })
    .eq('class_id', classId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
