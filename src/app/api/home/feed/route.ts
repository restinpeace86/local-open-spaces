import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_HOME_REGION, getHomeFeed } from '@/lib/home/get-home-feed';
import { extractSigunguName } from '@/lib/spaces/extract-district';

// Task 9-1(2026-08-22): 홈 화면 Hero Carousel/큐레이션 피드 API.
// 홈 페이지 Server Component가 최초 렌더링에 직접 쓰는 것과 같은 lib/home/get-home-feed.ts
// 로직을 그대로 재사용한다(클라이언트에서 새로고침/재조회가 필요할 때 이 라우트를 호출).
//
// Task 9-1-3: 반경 30km Haversine 필터링을 걷어내면서 ?lat=&lng= 좌표 파라미터도 함께
// 제거했다. 대신 유저가 설정한 위치명(useUserLocation의 addressName)을 ?address=로 그대로
// 받아 서버에서 시/군/구를 추출해 지역 우선 정렬에 반영한다. 없으면 기본 지역(성남시 분당구).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const addressParam = searchParams.get('address');
    const region = addressParam
      ? { sigunguName: extractSigunguName(addressParam) ?? DEFAULT_HOME_REGION.sigunguName }
      : DEFAULT_HOME_REGION;

    const feed = await getHomeFeed(region);
    return NextResponse.json(feed);
  } catch (err) {
    const message = err instanceof Error ? err.message : '홈 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
