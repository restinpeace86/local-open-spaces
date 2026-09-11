import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SPACE_COLUMNS, SpaceRow, toSpaceItem } from '@/lib/home/get-home-feed';

// [개선사항10](2026-09-11 사용자 지시, implementation/todo.md): "Event ➔ Spot: 이벤트
// 상세 화면의 장소/위치 영역을 탭했을 때, 연결된 open_spaces 상세 페이지로 이동".
// NearbyItem/RPC에 필드를 얹지 않고 DetailModal이 이벤트일 때만 별도로 조회한다
// (스팟픽 blogUrls/개선사항8 curated-blog-urls와 동일 패턴, 제5장 제4조).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    if (!eventId) return NextResponse.json({ spot: null });

    const supabase = await createClient();
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('space_id')
      .eq('id', eventId)
      .single();
    if (eventError || !eventRow?.space_id) return NextResponse.json({ spot: null });

    const { data: spaceRow, error: spaceError } = await supabase
      .from('open_spaces')
      .select(SPACE_COLUMNS)
      .eq('id', eventRow.space_id)
      .single();
    if (spaceError || !spaceRow) return NextResponse.json({ spot: null });

    return NextResponse.json({ spot: toSpaceItem(spaceRow as SpaceRow) });
  } catch {
    return NextResponse.json({ spot: null });
  }
}
