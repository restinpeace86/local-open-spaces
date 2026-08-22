import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_HOME_REGION, getThemeSpotFeed, HomeRegion } from '@/lib/home/get-home-feed';
import { isThemeSpotKey } from '@/lib/theme-spots';

// Task 9-5-1(2026-08-22): "🏞️ 목적별 추천 스팟" 칩 전용 지연 페칭 API.
// 홈 화면 초기 진입 시에는 페칭하지 않고(칩을 아직 하나도 안 눌렀을 수 있으므로), 유저가
// 특정 테마 칩을 선택할 때만 이 라우트를 호출한다 — /api/home/free-feed와 쿼리 파라미터
// 규약(sigungu/lat/lng)은 동일하게 맞춰 재조회 로직을 그대로 재사용한다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const themeParam = searchParams.get('theme');
    if (!themeParam || !isThemeSpotKey(themeParam)) {
      return NextResponse.json({ error: '유효하지 않은 theme 파라미터입니다.' }, { status: 400 });
    }

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

    const items = await getThemeSpotFeed(themeParam, 20, region, dataType);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : '테마 스팟 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
