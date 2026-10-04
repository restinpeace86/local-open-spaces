import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [롯데마트 문화센터 강좌 리스트 — 관리자 화면 노출](2026-10-04 사용자 지시):
// "지금 내가 확인해보려는데 관리자화면에 롯데마트쪽 탭이 안보이는데?" — 이마트
// 컬처클럽 관리자 패널(src/app/api/admin/emart-culture-club/route.ts)과 동일한
// 패턴. lottemart_culture_club_classes도 서비스롤 전용 RLS라 서비스롤 클라이언트로
// 조회한다. 전체 15,000건+ 규모라 PostgREST 기본 max-rows(1,000)에 걸리므로,
// 대상/상태/지점 필터로 좁혀 쓰는 걸 전제로 한다.
const ROWS_LIMIT = 1000;

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const targetCode = searchParams.get('target_code');
  const registrationStatus = searchParams.get('registration_status');
  const storeCode = searchParams.get('store_code');

  let query = supabase
    .from('lottemart_culture_club_classes')
    .select('*', { count: 'exact' })
    .order('collected_at', { ascending: false })
    .limit(ROWS_LIMIT);

  if (targetCode) query = query.eq('target_code', targetCode);
  if (registrationStatus) query = query.eq('registration_status', registrationStatus);
  if (storeCode) query = query.eq('store_code', storeCode);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}

// [수동 노출 제외] 이마트와 동일한 용도 — 관리자가 리뷰하며 개별 강좌를 노출
// 제외 처리할 수 있어야 한다(예: 실제로는 성인 대상인데 잘못 분류된 경우 등).
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
    .from('lottemart_culture_club_classes')
    .update({ is_excluded: isExcluded })
    .eq('class_id', classId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
