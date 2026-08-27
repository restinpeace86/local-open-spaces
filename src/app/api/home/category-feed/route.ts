import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_HOME_REGION, getCategoryMinFeed, HomeRegion } from '@/lib/home/get-home-feed';
import { isKnownCategoryMin } from '@/lib/spaces/category-maj-meta';

// Task 9-6-17(2026-08-25, docs/spec.md 2.2 ② 개정)/[대분류·중분류 드릴다운 개편](2026-08-27
// 사용자 지시): 이벤트픽 홈 화면 카테고리 그리드 인라인 피딩 전용 지연 페칭 API. 홈 화면
// 초기 진입 시에는 페칭하지 않고(어느 카테고리를 볼지 아직 모름), 유저가 대분류 → 중분류를
// 순서대로 선택했을 때만 호출한다(쿼리 파라미터 이름은 하위 호환을 위해 그대로 `category`를
// 쓰지만, 값 자체는 이제 event_type이 아니라 category_min이다) — /api/home/theme-feed와
// 쿼리 파라미터 규약(sigungu/lat/lng)을 동일하게 맞춘다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get('category');
    if (!categoryParam || !isKnownCategoryMin(categoryParam)) {
      return NextResponse.json({ error: '유효하지 않은 category 파라미터입니다.' }, { status: 400 });
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

    const items = await getCategoryMinFeed(categoryParam, 20, region);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : '카테고리 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
