import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [마이리얼트립 상품 → 우리 스팟 역방향 매칭](2026-09-16 사용자 지시): "몇백개의
// 키즈카페 중에 마이리얼트립에 있는건 46개.. 46개에 대하여 우리쪽 연결하고 그
// 연결한건 안나와서 내가 연결했다는걸 인지할수 있는것.. 소거법으로 가야하지
// 않을까?" — 스팟(수백 개) 하나하나에서 검색하는 대신, 마이리얼트립 상품
// (수십 개, 훨씬 적음) 목록을 기준으로 각각에 맞는 우리 스팟을 찾아 연결하는
// 역방향 흐름. 이 라우트는 검색 결과에 있는 gid들 중 이미 어떤 스팟과 연결된
// 것이 있는지 한 번에 조회해, 화면에서 "이미 연결됨"으로 표시하고 소거(다음
// 미해결 항목만 남기기)할 수 있게 한다.
export async function GET(request: NextRequest) {
  try {
    const gidsParam = new URL(request.url).searchParams.get('gids') ?? '';
    const gids = gidsParam.split(',').map((g) => g.trim()).filter(Boolean);
    if (gids.length === 0) return NextResponse.json({ links: [] });

    const admin = createAdminClient();
    const { data: linkRows, error: linkError } = await admin
      .from('spot_myrealtrip_links')
      .select('gid, spot_id')
      .in('gid', gids);
    if (linkError) throw new Error(linkError.message);

    const spotIds = [...new Set((linkRows ?? []).map((r) => r.spot_id))];
    let spotNameById: Record<string, string> = {};
    if (spotIds.length > 0) {
      const { data: spots, error: spotError } = await admin.from('open_spaces').select('id, name').in('id', spotIds);
      if (spotError) throw new Error(spotError.message);
      spotNameById = Object.fromEntries((spots ?? []).map((s) => [s.id, s.name]));
    }

    const links = (linkRows ?? []).map((r) => ({ gid: r.gid, spot_id: r.spot_id, spot_name: spotNameById[r.spot_id] ?? '' }));
    return NextResponse.json({ links });
  } catch (err) {
    const message = err instanceof Error ? err.message : '연결 상태 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
