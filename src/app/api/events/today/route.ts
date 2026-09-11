import { NextRequest, NextResponse } from 'next/server';
import { getTodayEventsPage } from '@/lib/home/get-home-feed';
import { findRegionOption } from '@/lib/geo/region-hierarchy';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';

// Task 9-6-6(2026-08-23): "오늘 전체보기" 전용 카드 그리드 페이지(/events/today)의 피드 API.
// [개선사항5](2026-09-11 사용자 지시, implementation/todo.md): 기존에는 limit=60 단일 조회
// (getTodayEvents)였으나, "전체보기 목록은 도 단위 1차 필터 → 거리 가까운 순 정렬 →
// 페이지네이션(무한 스크롤)"으로 바뀌어 전용 페이지 함수(getTodayEventsPage)를 쓴다 —
// region.provinceMembers(수동 선택된 지역 셀렉트)로 1차 SQL 필터를, lat/lng(유저 실제
// 위치)로 거리 정렬을 적용한다.
const DEFAULT_PAGE_SIZE = 24;

// [이벤트픽 전체보기 바텀시트化](2026-08-29 사용자 지시): 바텀시트 상단 중분류(대분류) 칩
// 클릭 시 즉시 필터링하기 위한 파라미터. 유효하지 않은 값은 조용히 무시한다(전체 조회로 폴백).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regionOption = findRegionOption(searchParams.get('region'));
    const categoryMaj = searchParams.get('category_maj');
    const categoryMins = CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === categoryMaj)?.minorCategories;

    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const latParam = Number(searchParams.get('lat'));
    const lngParam = Number(searchParams.get('lng'));
    const hasCoords =
      searchParams.has('lat') && searchParams.has('lng') && Number.isFinite(latParam) && Number.isFinite(lngParam);

    const { items, total } = await getTodayEventsPage(page, pageSize, categoryMins, {
      sigunguName: regionOption.sigunguName,
      provinceMembers: regionOption.provinceMembers,
      ...(hasCoords ? { lat: latParam, lng: lngParam } : {}),
      addressName: searchParams.get('address'),
    });

    return NextResponse.json({ items, total, page, pageSize, region: regionOption });
  } catch (err) {
    const message = err instanceof Error ? err.message : '오늘 전체보기 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
