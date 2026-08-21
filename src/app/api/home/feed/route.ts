import { NextResponse } from 'next/server';
import { getHomeFeed } from '@/lib/home/get-home-feed';

// Task 9-1(2026-08-22): 홈 화면 Hero Carousel/큐레이션 피드 API.
// 홈 페이지 Server Component가 최초 렌더링에 직접 쓰는 것과 같은 lib/home/get-home-feed.ts
// 로직을 그대로 재사용한다(클라이언트에서 새로고침/재조회가 필요할 때 이 라우트를 호출).
export async function GET() {
  try {
    const feed = await getHomeFeed();
    return NextResponse.json(feed);
  } catch (err) {
    const message = err instanceof Error ? err.message : '홈 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
