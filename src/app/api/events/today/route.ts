import { NextRequest, NextResponse } from 'next/server';
import { getTodayEvents } from '@/lib/home/get-home-feed';
import { findRegionOption } from '@/lib/geo/region-hierarchy';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';

// Task 9-6-6(2026-08-23): "오늘 전체보기" 전용 카드 그리드 페이지(/events/today)의 피드 API.
// 홈 화면 Hero Carousel(get-home-feed.ts의 getTodayEvents, DEFAULT_HOME_REGION)과 같은 조회
// 로직을 재사용하되(제5장 제4조 기존 구조 우선), region.provinceMembers를 함께 넘겨 3순위
// 조회까지도 선택 지역의 도/특별시 소속 시·군·구로만 제한한다 — 거리(GPS) 기반 정렬/피딩은
// 넘기지 않은 lat/lng가 애초에 없어 적용되지 않는다(getTodayEvents는 좌표를 알 때만 거리
// 재정렬을 한다).
const GRID_FETCH_LIMIT = 60;

// [이벤트픽 전체보기 바텀시트化](2026-08-29 사용자 지시): 바텀시트 상단 중분류(대분류) 칩
// 클릭 시 즉시 필터링하기 위한 파라미터. 유효하지 않은 값은 조용히 무시한다(전체 조회로 폴백).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regionOption = findRegionOption(searchParams.get('region'));
    const categoryMaj = searchParams.get('category_maj');
    const categoryMins = CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === categoryMaj)?.minorCategories;

    const items = await getTodayEvents(
      GRID_FETCH_LIMIT,
      { sigunguName: regionOption.sigunguName, provinceMembers: regionOption.provinceMembers },
      categoryMins
    );

    return NextResponse.json({ items, region: regionOption });
  } catch (err) {
    const message = err instanceof Error ? err.message : '오늘 전체보기 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
