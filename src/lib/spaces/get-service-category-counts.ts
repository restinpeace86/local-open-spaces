import { createClient } from '@/lib/supabase/server';

// [노출 중분류 기준 카테고리 필터 전면 교체](2026-09-08 사용자 지시): 스팟픽 지도의
// 대분류/중분류 바텀시트에서 "데이터가 0건인 중분류는 제외"하기 위한 전역 카운트.
// get-spot-category-counts.ts(기존 category_min 26개용 — 대형 중분류에서
// PostgREST 8초 statement timeout까지 실측 확인됐던 사례)와 동일한 이유로
// `count: 'estimated'`(플래너 추정치, 실제 스캔 없이 빠름)를 쓴다. 다만 이쪽은
// service_categories가 14개뿐이라(2026-09-08 실측) category_min 26개보다 훨씬
// 가벼워 타임아웃 위험 자체가 낮지만, 안전하게 같은 패턴을 재사용한다(제5장
// 제4조).
export async function getServiceCategoryCounts(serviceCategoryIds: readonly string[]): Promise<Record<string, number>> {
  const supabase = await createClient();

  const entries = await Promise.all(
    serviceCategoryIds.map(async (id) => {
      const { count, error } = await supabase
        .from('open_spaces')
        .select('id', { count: 'estimated', head: true })
        .eq('service_category_id', id)
        .eq('location_precision', 'EXACT');
      if (error) {
        console.error(`[getServiceCategoryCounts] ${id} 카운트 조회 실패: ${error.message}`);
        return [id, 1] as const; // 조회 실패 시엔 "있을 수도 있다"고 보수적으로 보여준다(숨기지 않음)
      }
      return [id, count ?? 0] as const;
    })
  );

  return Object.fromEntries(entries);
}
