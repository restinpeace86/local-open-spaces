import { NextResponse } from 'next/server';
import { getSpotCategoryMinCounts } from '@/lib/spaces/get-spot-category-counts';
import { AI_RECOMMEND_CATEGORY_ID, CORE_SPOT_CATEGORIES } from '@/lib/spaces/spot-category-groups';

// [todo.md 개선사항 6](2026-09-03): 스팟픽 대분류 바텀시트가 마운트 시 1회 호출해 0건인
// 중분류 칩을 숨기는 데 쓴다. 지역과 무관한 전역 카운트라 위치가 바뀌어도 재조회하지
// 않는다(home-view.tsx의 /api/home/category-min-counts와 동일한 관례).
export async function GET() {
  try {
    const categoryMins = Array.from(
      new Set(CORE_SPOT_CATEGORIES.filter((c) => c.id !== AI_RECOMMEND_CATEGORY_ID).flatMap((c) => c.minors))
    );
    const counts = await getSpotCategoryMinCounts(categoryMins);
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스팟픽 중분류 카운트 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
