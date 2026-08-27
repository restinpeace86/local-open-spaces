import { NextRequest, NextResponse } from 'next/server';
import { getCurrentlyOngoingEventsPage } from '@/lib/home/get-home-feed';

// [전체보기 페이지](2026-08-27 사용자 지시): "현재 이용 가능" 홈 미리보기가 최대 20건만
// 보여주고 끝나는 문제 — /events/today와 동일한 패턴으로 실제 DB 페이지네이션 전용 API를
// 둔다.
const DEFAULT_PAGE_SIZE = 24;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;

    const { items, total } = await getCurrentlyOngoingEventsPage(page, pageSize);
    return NextResponse.json({ items, total, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '현재 이용 가능 전체보기 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
