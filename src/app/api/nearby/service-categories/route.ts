import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServiceCategoryCounts } from '@/lib/spaces/get-service-category-counts';

// [노출 중분류 기준 카테고리 필터 전면 교체](2026-09-08 사용자 지시): "현재 노출
// 중분류 기준으로 카테고리 필터 전면교체할것" — 스팟픽 지도의 대분류/중분류
// 바텀시트가 참조할 공개 목록. `service_categories`는 RLS가 켜져 있고 정책이
// 없어(실측 확인) anon/쿠키 클라이언트로는 조회가 불가능하다(admin/service-
// categories/route.ts와 동일한 이유로 서비스 롤 사용) — 다만 이 라우트는
// 관리자 전용이 아니라 스팟픽(일반 사용자)이 호출하는 공개 조회다.
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data: categories, error } = await admin
      .from('service_categories')
      .select('id, parent_category, category_name')
      .order('parent_category', { ascending: true })
      .order('category_name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const counts = await getServiceCategoryCounts((categories ?? []).map((c) => c.id));

    return NextResponse.json({ items: categories ?? [], counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : '노출 중분류 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
