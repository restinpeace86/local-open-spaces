import { createClient } from '@/lib/supabase/server';

// [노출 중분류 기준 카테고리 필터 전면 교체](2026-09-08 사용자 지시): 스팟픽 지도의
// 대분류/중분류 바텀시트에서 "데이터가 0건인 중분류는 제외"하기 위한 전역 카운트.
// get-spot-category-counts.ts(기존 category_min 26개용 — 대형 중분류에서
// PostgREST 8초 statement timeout까지 실측 확인됐던 사례)와 동일한 이유로
// `count: 'estimated'`(플래너 추정치, 실제 스캔 없이 빠름)를 쓴다. 다만 이쪽은
// service_categories가 14개뿐이라(2026-09-08 실측) category_min 26개보다 훨씬
// 가벼워 타임아웃 위험 자체가 낮지만, 안전하게 같은 패턴을 재사용한다(제5장
// 제4조).
//
// [단독/병합 스팟 카운트 불일치 수정](2026-09-09 사용자 지시): "캠핑장 3395건
// 나오던데.. 그건 합친거는 대표 1건만 친거야? 아니면 합치기 전 기준으로 모든
// 건수 다 반영한거야?" — 실측 확인 결과 이 카운트는 group_id/is_dedup_
// representative를 전혀 보지 않아 병합된 중복 멤버까지 전부 세고 있었다
// (예: 캠핑장 실측 raw 3,859건 vs 대표만 3,399건 — 460건 차이). [[2026-09-09-
// admin-grid-representative-collapse]](Step 82)에서 관리자 그리드에는 이미
// 적용한 필터를 여기(소비자 화면 중분류 칩 카운트)에도 동일하게 적용한다 —
// 관리자 화면과 소비자 화면이 "하나의 깔끔한 레코드"라는 같은 기준을 쓰도록.
export async function getServiceCategoryCounts(serviceCategoryIds: readonly string[]): Promise<Record<string, number>> {
  const supabase = await createClient();

  const entries = await Promise.all(
    serviceCategoryIds.map(async (id) => {
      const { count, error } = await supabase
        .from('open_spaces')
        .select('id', { count: 'estimated', head: true })
        .eq('service_category_id', id)
        .eq('location_precision', 'EXACT')
        .or('group_id.is.null,is_dedup_representative.eq.true');
      if (error) {
        console.error(`[getServiceCategoryCounts] ${id} 카운트 조회 실패: ${error.message}`);
        return [id, 1] as const; // 조회 실패 시엔 "있을 수도 있다"고 보수적으로 보여준다(숨기지 않음)
      }
      return [id, count ?? 0] as const;
    })
  );

  return Object.fromEntries(entries);
}
