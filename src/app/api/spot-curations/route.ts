import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
// 섹션 1 "View/Reservation Fallback"이 읽는 공개 조회 엔드포인트. `/api/admin/spot-curations`
// (어드민 전용, is_active 무관하게 전체 조회)와 분리한다 — /api/curated-items ↔
// /api/admin/curated-items와 동일한 패턴(spot_curations는 RLS가 켜져 있고 정책이 없어
// anon 키로는 직접 조회 불가능하므로 서비스 롤 클라이언트를 서버에서만 쓴다). 공개
// 조회는 is_active=true인 것만 내려준다 — 관리자가 비활성화한 큐레이션은 유저에게
// "풍성한 뷰"로 노출되면 안 되고 즉시 공공데이터 기본 뼈대로 되돌아가야 한다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spotId = searchParams.get('spot_id')?.trim();
    if (!spotId) {
      return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('spot_curations')
      .select(
        'id, spot_id, image_url, operating_hours_raw, open_time, close_time, break_start, break_end, last_order, menu_items, naver_booking_url, curation_note'
      )
      .eq('spot_id', spotId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스팟 큐레이션 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
