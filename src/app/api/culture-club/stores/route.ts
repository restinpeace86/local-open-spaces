import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [문화센터 탭 — 지점 선택](2026-10-03 사용자 지시): "지점 선택(Branch Selector -
// 단일선택) ... 유저가 쉽게 클릭한번으로 선택" — 지점 목록은 emart_culture_club_classes
// (6,500여건, store_code/store_name만 raw)를 직접 훑는 대신, 이미 이번 세션에서
// 지오코딩/브랜드 정규화까지 끝낸 open_spaces의 EMART_STORE_* 행(64건, 2026-10-03
// "이마트 지점 open_spaces 등록" 작업물)을 재사용한다 — 기존 구조 우선(제5장 제4조),
// display_name이 이미 브랜드별로 정리돼 있어(예: "트레이더스 킨텍스점") raw store_name
// ("트레이더스킨텍스")보다 화면에 보여주기 좋고, 조회량도 64건으로 훨씬 가볍다.
const EXTERNAL_ID_PREFIX = 'EMART_STORE_';
const CULTURE_CENTER_CATEGORY_MIN = '대형마트문화센터';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('open_spaces')
      .select('external_id, display_name, name')
      .eq('category_min', CULTURE_CENTER_CATEGORY_MIN)
      .order('display_name', { ascending: true });

    if (error) throw new Error(error.message);

    const stores = (data ?? [])
      .filter((row): row is typeof row & { external_id: string } => Boolean(row.external_id?.startsWith(EXTERNAL_ID_PREFIX)))
      .map((row) => ({
        storeCode: row.external_id.slice(EXTERNAL_ID_PREFIX.length),
        label: row.display_name ?? row.name,
      }));

    return NextResponse.json({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : '이마트 컬처클럽 지점 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
