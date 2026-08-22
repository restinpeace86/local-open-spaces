import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_HOME_REGION, getHomeFeed, HomeRegion } from '@/lib/home/get-home-feed';

// Task 9-1(2026-08-22): 홈 화면 Hero Carousel/큐레이션 피드 API.
// 홈 페이지 Server Component가 최초 렌더링에 직접 쓰는 것과 같은 lib/home/get-home-feed.ts
// 로직을 그대로 재사용한다(클라이언트에서 새로고침/재조회가 필요할 때 이 라우트를 호출).
//
// Task 9-1-3: 반경 30km Haversine 필터링을 걷어내면서 ?lat=&lng= 좌표 파라미터도 제거했다.
// 유저가 위치를 "설정하는 시점"(온보딩 모달 확정 시, 클라이언트)에 시/군/구를 이미 한 번
// 계산해 LocalStorage에 저장해 두므로, 이 라우트는 ?sigungu=로 그 값을 그대로 받아 쓸 뿐
// 요청마다 주소 문자열을 다시 파싱하지 않는다.
//
// 사용자 피드백(2026-08-22): 위치가 설정/재설정되어 실제 좌표를 알게 된 경우, 그 좌표에서
// 가까운 순서로 노출해 달라는 요청에 따라 ?lat=&lng=를 선택적으로 다시 받는다. 이 좌표는
// get-home-feed.ts에서 반경 필터링(전체 스캔)이 아니라, 이미 축소된 후보군 안에서의 거리
// 정렬에만 쓰이므로 Task 9-1-3에서 없앤 "매 요청 전체 Haversine 필터링"과는 다르다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sigunguParam = searchParams.get('sigungu');
    const latParam = Number(searchParams.get('lat'));
    const lngParam = Number(searchParams.get('lng'));
    const hasCoords =
      searchParams.has('lat') && searchParams.has('lng') && Number.isFinite(latParam) && Number.isFinite(lngParam);

    const region: HomeRegion = {
      sigunguName: sigunguParam || DEFAULT_HOME_REGION.sigunguName,
      ...(hasCoords ? { lat: latParam, lng: lngParam } : {}),
    };

    const feed = await getHomeFeed(region);
    return NextResponse.json(feed);
  } catch (err) {
    const message = err instanceof Error ? err.message : '홈 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
