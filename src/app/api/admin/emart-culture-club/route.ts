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
