import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_HOME_REGION, getFreeFeed, HomeRegion } from '@/lib/home/get-home-feed';

// Task 9-3-1(2026-08-22): "💰 가성비 행복" 하단 섹션 전용 지연 페칭 API.
// 홈 화면 초기 진입 시에는 더 이상 이 데이터를 함께 내려주지 않고(page.tsx는 Hero만 페칭),
// HomeView가 해당 섹션을 화면에서 처음 감지하거나(Intersection Observer) "무료·공공" 탭을
// 선택할 때만 이 라우트를 호출한다 — /api/home/feed(Hero+가성비 통합)와 쿼리 파라미터
// 규약(sigungu/lat/lng)은 동일하게 맞춰 재조회 로직을 그대로 재사용한다.
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

    // Task 9-6-4(2026-08-23): 홈 화면 최상위 대분류(🎪 행사·축제 기본/🏞️ 상시 장소) 토글용.
    const dataType = searchParams.get('dataType') === 'open_spaces' ? 'open_spaces' : 'events';

    const freeFeed = await getFreeFeed(12, region, dataType);
    return NextResponse.json({ freeFeed });
  } catch (err) {
    const message = err instanceof Error ? err.message : '가성비 행복 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
