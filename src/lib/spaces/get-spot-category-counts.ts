import { createClient } from '@/lib/supabase/server';

// [todo.md 개선사항 6](2026-09-03): 스팟픽 대분류 바텀시트에서 "데이터가 0건인 중분류는
// 제외"하기 위한 전역(지역 무관) 카운트 사전 계산. get-home-feed.ts의 getCategoryMinCounts
// (이벤트픽 바텀시트에 동일 원칙을 적용할 때 만든 함수)와 동일한 목적이지만, open_spaces
// (14만+ 행, events의 5배 이상)에서는 `count: 'exact'`를 26개 중분류에 대해 동시에 돌리면
// 실측으로 확인한 대로 건당 1~12초까지 걸려(대형 중분류일수록 heap 랜덤 접근이 많아짐)
// 일부는 8초 PostgREST statement timeout에 걸려 실패했다(어린이놀이터/공원/도서관 등 —
// 크기와 무관하게 동시 부하 경합으로 실패). 이 용도(0건인지 아닌지만 판단)에는 정확한
// 카운트가 필요 없으므로, 실행 계획만 세우고 실제 스캔은 하지 않는 `count: 'estimated'`
// (PostgREST가 EXPLAIN의 planner row 추정치를 반환)로 바꿨다 — 실측 결과 추정치가
// 실제값과 거의 일치했고(어린이놀이터 실측 57,692 vs 추정 58,151), 무엇보다 스캔 자체를
// 안 하므로 안정적으로 빠르다.
export async function getSpotCategoryMinCounts(categoryMins: readonly string[]): Promise<Record<string, number>> {
  const supabase = await createClient();

  const entries = await Promise.all(
    categoryMins.map(async (categoryMin) => {
      const { count, error } = await supabase
        .from('open_spaces')
        .select('id', { count: 'estimated', head: true })
        .eq('category_min', categoryMin)
        .eq('location_precision', 'EXACT');
      if (error) {
        console.error(`[getSpotCategoryMinCounts] ${categoryMin} 카운트 조회 실패: ${error.message}`);
        return [categoryMin, 1] as const; // 조회 실패 시엔 "있을 수도 있다"고 보수적으로 보여준다(숨기지 않음)
      }
      return [categoryMin, count ?? 0] as const;
    })
  );

  return Object.fromEntries(entries);
}
