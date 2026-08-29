import { NextRequest, NextResponse } from 'next/server';
import { getReservationOpenEventsPage } from '@/lib/home/get-home-feed';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';

// [전체보기 페이지](2026-08-27 사용자 지시): "예약 가능" 홈 미리보기가 최대 20건만 보여주고
// 끝나는 문제 — /events/today와 동일한 패턴으로 실제 DB 페이지네이션 전용 API를 둔다.
const DEFAULT_PAGE_SIZE = 24;

// [이벤트픽 전체보기 바텀시트化](2026-08-29 사용자 지시): 바텀시트 중분류(대분류) 칩 필터.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const categoryMaj = searchParams.get('category_maj');
    const categoryMins = CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === categoryMaj)?.minorCategories;

    const { items, total } = await getReservationOpenEventsPage(page, pageSize, categoryMins);
    return NextResponse.json({ items, total, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예약 가능 전체보기 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
