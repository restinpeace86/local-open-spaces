import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [제휴 상품 ↔ 스팟픽 마커 연동](2026-09-10 사용자 지시, implementation/todo.md
// 개선사항6): "spot_id가 매핑되어 있고 '노출 활성화'된 제휴 상품이 존재하는
// 스팟"의 목록을 스팟픽 지도가 한 번 조회해, 해당 스팟을 특가/Hot 마커로 강조하고
// 마커/상세 카드에서 연동 제휴 상품 링크로 연결한다.
//
// curated_items는 RLS+정책 없음이라 service_role로 읽는다(curated-items 라우트와
// 동일). 운영 기간(operation_start/end_date)이 오늘을 포함하는(또는 NULL인 상시)
// 활성 상품만 노출한다.
export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('curated_items')
      .select('spot_id, title, booking_url, image_url, operation_start_date, operation_end_date')
      .eq('is_active', true)
      .not('spot_id', 'is', null)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ deals: {} }, { status: 200 });

    const deals: Record<string, { title: string; bookingUrl: string; imageUrl: string | null }> = {};
    for (const row of data ?? []) {
      if (!row.spot_id) continue;
      if (row.operation_start_date && row.operation_start_date > today) continue;
      if (row.operation_end_date && row.operation_end_date < today) continue;
      // 한 스팟에 여러 활성 상품이 붙어 있으면 최신(created_at desc 첫 번째)을 쓴다.
      if (!deals[row.spot_id]) {
        deals[row.spot_id] = { title: row.title, bookingUrl: row.booking_url, imageUrl: row.image_url ?? null };
      }
    }
    return NextResponse.json({ deals });
  } catch {
    return NextResponse.json({ deals: {} }, { status: 200 });
  }
}
