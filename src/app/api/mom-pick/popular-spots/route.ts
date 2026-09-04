import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.6: [설문형 스마트
// 리뷰 폼] 1단계 "내 주변 인기 스팟" 피커. 반경 30km, 대상 category_min은 스펙 2.6이
// 확정한 목록(공원/박물관·미술관·과학관/키즈카페·실내놀이터/캠핑장·자연휴양림/
// 도서관) + 이벤트픽 전체(별도 category_min 제한 없음). 기존 get_nearby_spaces_and_
// events RPC(KNN 정렬)를 그대로 재사용한다(제5장 제4조 기존 구조 우선 — 새 RPC를
// 만들지 않음).
const RADIUS_METERS = 30000;
const SPACE_CATEGORY_MINS = [
  '공원',
  '종합/기타박물관',
  '역사박물관',
  '미술관',
  '과학관',
  '키즈카페',
  '어린이놀이시설(실내)',
  '캠핑장',
  '자연휴양림',
  '도서관',
];
const RESULT_LIMIT = 40;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: '위치 정보(lat, lng)가 필요합니다.' }, { status: 400 });
    }

    const supabase = await createClient();

    const [spaceResult, eventResult] = await Promise.all([
      supabase.rpc('get_nearby_spaces_and_events', {
        user_lng: lng,
        user_lat: lat,
        radius_meters: RADIUS_METERS,
        p_item_type: 'SPACE',
        p_category_mins: SPACE_CATEGORY_MINS,
      }),
      supabase.rpc('get_nearby_spaces_and_events', {
        user_lng: lng,
        user_lat: lat,
        radius_meters: RADIUS_METERS,
        p_item_type: 'EVENT',
      }),
    ]);

    if (spaceResult.error) return NextResponse.json({ error: spaceResult.error.message }, { status: 500 });
    if (eventResult.error) return NextResponse.json({ error: eventResult.error.message }, { status: 500 });

    const items = [...((spaceResult.data ?? []) as NearbyItem[]), ...((eventResult.data ?? []) as NearbyItem[])];

    // [spec 2.6 랭킹] 조회수 등 별도 인기도 집계가 없어(추측 금지), 이미 있는 실제
    // 신호(mom_pick_posts에 이미 리뷰가 달렸는지)만 가볍게 반영한다 — 거리 오름차순이
    // 기본이고, 그중 이미 리뷰가 1건 이상 있는 스팟/이벤트를 동일 거리대에서 우선한다.
    const spotIds = items.filter((i) => i.item_type === 'SPACE').map((i) => i.id);
    const eventIds = items.filter((i) => i.item_type === 'EVENT').map((i) => i.id);
    const reviewedIds = new Set<string>();
    if (spotIds.length > 0 || eventIds.length > 0) {
      const orParts = [
        spotIds.length > 0 ? `spot_id.in.(${spotIds.join(',')})` : null,
        eventIds.length > 0 ? `event_id.in.(${eventIds.join(',')})` : null,
      ].filter((p): p is string => p != null);
      const { data: reviewedRows } = await supabase
        .from('mom_pick_posts')
        .select('spot_id, event_id')
        .or(orParts.join(','));
      for (const row of reviewedRows ?? []) {
        if (row.spot_id) reviewedIds.add(row.spot_id);
        if (row.event_id) reviewedIds.add(row.event_id);
      }
    }

    const sorted = [...items].sort((a, b) => {
      const aReviewed = reviewedIds.has(a.id) ? 0 : 1;
      const bReviewed = reviewedIds.has(b.id) ? 0 : 1;
      if (aReviewed !== bReviewed) return aReviewed - bReviewed;
      return a.distance_meters - b.distance_meters;
    });

    return NextResponse.json({ items: sorted.slice(0, RESULT_LIMIT) });
  } catch (err) {
    const message = err instanceof Error ? err.message : '내 주변 인기 스팟 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
