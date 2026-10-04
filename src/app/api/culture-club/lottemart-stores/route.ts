import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [롯데마트 문화센터 — 지점 선택](2026-10-04 사용자 지시): 화면 구조 참조 요청
// (reference/lottemart culture.png) — 이마트는 open_spaces에 이미 지오코딩된
// EMART_STORE_* 행(64건)이 있어 그걸 재사용했지만, 롯데마트는 아직 open_spaces에
// 등록된 지점이 없다(별도 지오코딩 작업 필요, 이번 범위 아님). 제5장 제4조
// 기존 구조 우선 원칙에 따라 "이미 수집한 실제 데이터"를 재사용한다 —
// lottemart_culture_club_classes에서 store_code/store_name을 distinct로 뽑는다
// (이마트처럼 지역 접미사는 아직 안 붙임 — open_spaces 등록 후 추가 가능).
//
// [PostgREST 1000행 기본 제한 — 실측으로 발견](2026-10-04): 이 테이블은 60개
// 지점 전체 15,000여 건이라, `.range()` 없이 그냥 select하면 PostgREST가 기본
// 1,000행만 돌려줘 지점 목록이 일부만(실측: 5개) 노출되는 버그가 났다. 이
// 세션에서 반복 확인된 패턴(emart-culture-club.mjs의 fetchExistingClassIds 등)
// 그대로 페이지네이션 루프로 전체를 훑는다.
const PAGE_SIZE = 1000;

export async function GET() {
  try {
    const supabase = createAdminClient();
    const seen = new Map<string, string>();

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('lottemart_culture_club_classes')
        .select('store_code, store_name')
        .eq('is_excluded', false)
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (!seen.has(row.store_code)) seen.set(row.store_code, row.store_name);
      }
      if (!data || data.length < PAGE_SIZE) break;
    }

    const stores = [...seen.entries()]
      .map(([storeCode, label]) => ({ storeCode, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));

    return NextResponse.json({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : '롯데마트 문화센터 지점 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
