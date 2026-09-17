import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [마이리얼트립 중복 등록 방지](2026-09-17 사용자 보고: "[여주] 루덴시아 테마파크
// 9월 특가 이거 2개 보이는데? 중복입력된거 아니야?") — 실측 확인 결과 같은 상품을
// 시간차를 두고(2026-09-17 00:36과 07:27) 두 번 "제휴 상품으로 등록"해 생긴
// 중복이었다. spot_myrealtrip_links/by-gids와 동일한 패턴 — 검색 결과에 있는
// gid들 중 이미 curated_items로 등록된 게 있는지 한 번에 조회해, 검색 화면에서
// "이미 등록됨"으로 표시하고 재등록 시 경고할 수 있게 한다.
export async function GET(request: NextRequest) {
  try {
    const gidsParam = new URL(request.url).searchParams.get('gids') ?? '';
    const gids = gidsParam.split(',').map((g) => g.trim()).filter(Boolean);
    if (gids.length === 0) return NextResponse.json({ items: [] });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('curated_items')
      .select('myrealtrip_gid, id, title')
      .in('myrealtrip_gid', gids);
    if (error) throw new Error(error.message);

    const items = (data ?? []).map((row) => ({ gid: row.myrealtrip_gid as string, id: row.id, title: row.title }));
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : '등록 상태 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
