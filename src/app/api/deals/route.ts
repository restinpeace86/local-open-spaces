import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [제휴 특가 Deals 시스템 및 수집 어댑터 MVP](2026-08-29 사용자 지시): 활성화된(is_active)
// 특가 상품을 최신순으로 보여주는 공개 조회 엔드포인트. deals는 RLS가 켜져 있고 정책이
// 없어(scripts/migrations/2026-08-29-create-deals-table.sql) anon 키로는 직접 조회가
// 되지 않는다 — reservations GET과 동일하게 서비스 롤 클라이언트를 서버에서만 쓴다.
const DEFAULT_PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;

    const admin = createAdminClient();
    const { data, error, count } = await admin
      .from('deals')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deals: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '특가 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
