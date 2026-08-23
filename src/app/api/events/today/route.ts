import { NextRequest, NextResponse } from 'next/server';
import { getTodayEvents } from '@/lib/home/get-home-feed';
import { findRegionOption } from '@/lib/geo/region-hierarchy';

// Task 9-6-6(2026-08-23): "오늘 전체보기" 전용 카드 그리드 페이지(/events/today)의 피드 API.
// 홈 화면 Hero Carousel(get-home-feed.ts의 getTodayEvents, DEFAULT_HOME_REGION)과 같은 조회
// 로직을 재사용하되(제5장 제4조 기존 구조 우선), region.provinceMembers를 함께 넘겨 3순위
// 조회까지도 선택 지역의 도/특별시 소속 시·군·구로만 제한한다 — 거리(GPS) 기반 정렬/피딩은
// 넘기지 않은 lat/lng가 애초에 없어 적용되지 않는다(getTodayEvents는 좌표를 알 때만 거리
// 재정렬을 한다).
const GRID_FETCH_LIMIT = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regionOption = findRegionOption(searchParams.get('region'));

    const items = await getTodayEvents(GRID_FETCH_LIMIT, {
      sigunguName: regionOption.sigunguName,
      provinceMembers: regionOption.provinceMembers,
    });

    return NextResponse.json({ items, region: regionOption });
  } catch (err) {
    const message = err instanceof Error ? err.message : '오늘 전체보기 피드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
