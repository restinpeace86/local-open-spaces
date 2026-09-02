import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 3-1: "채택"은 좋아요 수와
// 무관하게 관리자가 수동으로 지정하는 별도 개념이다. mom_pick_posts는 RLS가 켜져 있고
// is_adopted/adopted_at/adopted_by는 일반 사용자 정책으로 절대 못 바꾸게 트리거로 막아뒀다
// (2026-09-02-mom-pick-tables.sql의 protect_mom_pick_post_adoption_fields) — 이 라우트만
// service_role(createAdminClient())로 그 트리거를 우회해 실제로 채택 처리한다.
const DEFAULT_PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const adoptedOnly = searchParams.get('adopted_only') === 'true';

    const admin = createAdminClient();
    let query = admin
      .from('mom_pick_posts')
      .select('*, open_spaces(name, address)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (adoptedOnly) query = query.eq('is_adopted', true);

    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '맘스픽 후기 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const isAdopted = body.is_adopted;
    if (!id || typeof isAdopted !== 'boolean') {
      return NextResponse.json({ error: 'id와 is_adopted(boolean)가 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    // [채택자 기록] 지금 이 프로젝트에는 어드민 개인 계정 식별 체계가 없어(Decision 007의
    // user_metadata.role 기반 RBAC는 아직 is_admin() 자체가 미구현 — 실측 확인됨) "누가"
    // 채택했는지는 남기지 않고 시각만 남긴다. 추후 어드민 계정 체계가 생기면 adopted_by를
        // 채우는 것으로 자연스럽게 확장 가능하다(제3장 제4조 확장성 고려).
    const { data, error } = await admin
      .from('mom_pick_posts')
      .update({ is_adopted: isAdopted, adopted_at: isAdopted ? new Date().toISOString() : null })
      .eq('id', id)
      .select('*, open_spaces(name, address)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '채택 처리 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
