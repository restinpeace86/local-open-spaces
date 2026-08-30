import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30
// 사용자 지시): 홈 화면 "베스트 나들이 픽" 섹션이 읽는 공개 조회 엔드포인트. 기존
// /api/event-tickets(event_tickets 테이블)를 대체한다 — curated_items는 RLS가 켜져
// 있고 정책이 없어 anon 키로는 직접 조회가 되지 않으므로 서비스 롤 클라이언트를
// 서버에서만 쓴다(/api/deals, 옛 /api/event-tickets와 동일 패턴).
const DEFAULT_PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const today = new Date().toISOString().slice(0, 10);

    const admin = createAdminClient();
    // 운영 기간(operation_start_date~operation_end_date)이 설정된 상품은 그 기간
    // 안에서만 노출한다 — 컬럼 자체가 "예약 가능 기간"을 표현하기 위한 것이므로, 기간이
    // 지났거나 아직 시작하지 않은 상품을 홈 화면에 그대로 보여주면 유저가 예약할 수
    // 없는 상품을 큐레이션으로 추천하는 셈이 된다. 상시 노출 상품(날짜 미설정, NULL)은
    // 기존처럼 계속 보인다.
    const { data, error, count } = await admin
      .from('curated_items')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .or(`operation_start_date.is.null,operation_start_date.lte.${today}`)
      .or(`operation_end_date.is.null,operation_end_date.gte.${today}`)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '큐레이션 상품 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
