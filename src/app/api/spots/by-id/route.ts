import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SPACE_COLUMNS, SpaceRow, toSpaceItem } from '@/lib/home/get-home-feed';

// [맘스픽 상세 → 스팟픽 이동](2026-09-13 사용자 지시): "맘스픽으로부터 스팟픽의
// 해당 장소로 갈수 있어야해" — /nearby?spot=<id> 딥링크가 그 id로 open_spaces
// 한 건을 NearbyItem 모양으로 조회할 때 쓴다. /api/events/linked-spot(개선사항10,
// "Event ➔ Spot" 이동)이 이미 같은 SPACE_COLUMNS/toSpaceItem으로 단건 조회를
// 하고 있어 그 관례를 그대로 재사용한다(제5장 제4조 기존 구조 우선).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spotId = searchParams.get('id');
    if (!spotId) return NextResponse.json({ item: null });

    const supabase = await createClient();
    const { data: spaceRow, error } = await supabase
      .from('open_spaces')
      .select(SPACE_COLUMNS)
      .eq('id', spotId)
      .single();
    if (error || !spaceRow) return NextResponse.json({ item: null });

    return NextResponse.json({ item: toSpaceItem(spaceRow as SpaceRow) });
  } catch {
    return NextResponse.json({ item: null });
  }
}
