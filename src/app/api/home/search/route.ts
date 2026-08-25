import { NextRequest, NextResponse } from 'next/server';
import { searchEvents } from '@/lib/home/get-home-feed';

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "GNB 헤더 & 검색"): 이벤트픽 GNB
// 검색은 events 테이블 전용으로 수행한다 — 스팟픽(/nearby)의 open_spaces 검색과 명확히
// 분리된 별도 엔드포인트다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').trim();
    if (!q) return NextResponse.json({ items: [] });

    const items = await searchEvents(q);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : '이벤트 검색 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
