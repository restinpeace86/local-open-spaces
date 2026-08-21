import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_HOME_ORIGIN, getHomeFeed } from '@/lib/home/get-home-feed';

// Task 9-1(2026-08-22): 홈 화면 Hero Carousel/큐레이션 피드 API.
// 홈 페이지 Server Component가 최초 렌더링에 직접 쓰는 것과 같은 lib/home/get-home-feed.ts
// 로직을 그대로 재사용한다(클라이언트에서 새로고침/재조회가 필요할 때 이 라우트를 호출).
//
// Task 9-1-1: 유저가 실제로 위치를 설정한 경우(useUserLocation, LocalStorage) 클라이언트가
// ?lat=&lng=로 그 좌표를 넘겨 반경 30km 필터링에 반영한다. 넘기지 않으면 기본값(성남시 분당구).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latParam = Number(searchParams.get('lat'));
    const lngParam = Number(searchParams.get('lng'));
    const origin =
      Number.isFinite(latParam) && Number.isFinite(lngParam) && searchParams.has('lat') && searchParams.has('lng')
        ? { lat: latParam, lng: lngParam }
        : DEFAULT_HOME_ORIGIN;

    const feed = await getHomeFeed(origin);
    return NextResponse.json(feed);
  } catch (err) {
    const message = err instanceof Error ? err.message : '홈 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
