import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { NearbyItem } from '@/lib/spaces/get-nearby';

// [제휴 상품 ↔ 스팟픽 마커 연동 + 노출 중분류 무관 노출](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항6 / 후속):
//  - deals: spot_id → 제휴 상품 요약(특가 마커/CTA용).
//  - items: 노출 활성화 + 운영기간 유효한 제휴 상품이 연결된 스팟 전체
//    (get_deal_spots RPC, NearbyItem 형태). 스팟픽이 노출 중분류 필터와 무관하게
//    이 스팟들을 지도/바텀시트에 (반경 내면) 거리순으로 끼워 넣는다.
// curated_items는 RLS+정책 없음이라 service_role로 읽는다.
export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const admin = createAdminClient();

    const [{ data: dealRows, error: dealErr }, { data: itemRows, error: itemErr }] = await Promise.all([
      admin
        .from('curated_items')
        .select('spot_id, title, booking_url, image_url, operation_start_date, operation_end_date')
        .eq('is_active', true)
        .not('spot_id', 'is', null)
        .order('created_at', { ascending: false }),
      admin.rpc('get_deal_spots'),
    ]);

    if (dealErr || itemErr) return NextResponse.json({ deals: {}, items: [] }, { status: 200 });

    const deals: Record<string, { title: string; bookingUrl: string; imageUrl: string | null }> = {};
    for (const row of dealRows ?? []) {
      if (!row.spot_id) continue;
      if (row.operation_start_date && row.operation_start_date > today) continue;
      if (row.operation_end_date && row.operation_end_date < today) continue;
      if (!deals[row.spot_id]) {
        deals[row.spot_id] = { title: row.title, bookingUrl: row.booking_url, imageUrl: row.image_url ?? null };
      }
    }

    // RPC가 돌려준 스팟 중 실제로 활성 제휴 상품이 매핑된 것만 items로 내려준다
    // (RPC의 exists 조건과 위 deals 맵이 동일 기준이라 사실상 전부 일치한다).
    const items = ((itemRows ?? []) as NearbyItem[]).filter((it) => deals[it.id]);

    return NextResponse.json({ deals, items });
  } catch {
    return NextResponse.json({ deals: {}, items: [] }, { status: 200 });
  }
}
