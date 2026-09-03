import { NextResponse } from 'next/server';
import { getCategoryMinCounts } from '@/lib/home/get-home-feed';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';

// [todo.md 개선사항 3](2026-09-03): 이벤트픽 대분류/중분류 바텀시트가 열릴 때, 구조적으로
// 0건인 중분류(is_active+가족·아동 대상+진행중 조건을 동시에 만족하는 행이 아예 없는
// 경우)를 미리 걸러내기 위한 카운트 조회. 지역 무관 전역 카운트라 캐싱 여지가 크지만
// (하루 여러 번 바뀌지 않음) 우선 매 요청 조회로 단순하게 구현한다.
const ALL_MINOR_CATEGORIES = CATEGORY_MAJ_OPTIONS.flatMap((opt) => opt.minorCategories);

export async function GET() {
  try {
    const counts = await getCategoryMinCounts(ALL_MINOR_CATEGORIES);
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : '중분류 카운트 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
