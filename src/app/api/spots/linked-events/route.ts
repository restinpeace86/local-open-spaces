import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EVENT_COLUMNS, EVENT_PICK_TARGET_AUDIENCES, EventRow, toEventItem } from '@/lib/home/get-home-feed';
import { isEventOperatingOn } from '@/lib/spaces/event-operating-schedule';

// [개선사항10](2026-09-11 사용자 지시, implementation/todo.md): "Spot ➔ Event: 스팟
// 상세 페이지에 현재 활성화/예정된 이벤트 섹션을 표시하고, 없으면 섹션 자체를
// 숨김". NearbyItem/RPC에 필드를 얹지 않고 DetailModal이 스팟일 때만 별도로 조회한다
// (제5장 제4조 — 개선사항8/linked-spot과 동일 패턴).
const LINKED_EVENTS_LIMIT = 10;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spotId = searchParams.get('spot_id');
    if (!spotId) return NextResponse.json({ events: [] });

    const today = new Date().toISOString().slice(0, 10);
    const supabase = await createClient();
    // "현재 활성화/예정" — 아직 끝나지 않은 이벤트만(과거에 끝난 이벤트는 제외).
    // [타겟 연령 4개 밖 이벤트 노출 방지](2026-09-12 사용자 지시): "특정 이벤트에
    // 대하여 스팟픽에서도 연결된거.. 저 연령 4개 외에 연결되어있어도 스팟픽에서
    // 해당 장소 눌렀을때 이벤트 나오면 안되긴 해" — 실측 확인(714건 중 515건,
    // 72%가 4개 밖/NULL) 이벤트픽 피드는 전부 EVENT_PICK_TARGET_AUDIENCES로
    // 걸러지는데 이 "스팟 상세 → 연결된 이벤트" 경로만 그 필터가 빠져 있었다 —
    // 다른 이벤트픽 조회들과 동일한 필터를 추가해 일관성을 맞춘다.
    // [운영 요일/반복 규칙](2026-09-12 사용자 지시): "일자는 기본적으로
    // 원천데이터꺼로 하긴 하는데 예외 규칙을 여기서 집어넣으면 해당 예외 규칙도
    // 적용되도록.. 이벤트 기간중에 있더라도 이에 부합하지 않으면 안나오도록해야돼"
    // — start_date~end_date 기간 필터(위 gte)는 그대로 두고, 그 안에서도 오늘
    // 요일이 관리자가 지정한 운영/휴무 요일 규칙에 맞는지 추가로 검사한다. DB
    // 필터로는 표현하기 까다로워(요일 배열 포함 여부 + "오늘" 계산) 조회 후 JS에서
    // 걸러낸다 — 스팟 하나당 최대 LINKED_EVENTS_LIMIT건이라 성능 문제 없음.
    const { data, error } = await supabase
      .from('events')
      .select(`${EVENT_COLUMNS}, operating_weekdays, excluded_weekdays`)
      .eq('space_id', spotId)
      .eq('is_active', true)
      .gte('end_date', today)
      .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
      .order('start_date', { ascending: true })
      .limit(LINKED_EVENTS_LIMIT);

    if (error || !data) return NextResponse.json({ events: [] });

    const now = new Date();
    const operatingToday = (
      data as (EventRow & { operating_weekdays: string[] | null; excluded_weekdays: string[] | null })[]
    ).filter((row) => isEventOperatingOn(row, now));

    return NextResponse.json({ events: operatingToday.map(toEventItem) });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
