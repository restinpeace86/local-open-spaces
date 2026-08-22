import { createClient } from '@/lib/supabase/client';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// Task 9-6-4(2026-08-23): region-grid-view.tsx의 "🎪 행사·축제" 대분류 카탈로그 탐색용.
// get-all-spaces.ts(getAllOpenSpaces)와 동일한 패턴 — 반경 검색이 아닌 전체 카탈로그
// 탐색이라 get_nearby_spaces_and_events RPC 대신 events 테이블을 직접 조회한다.
// 이미 끝난 행사는 카탈로그에 남겨둘 이유가 없어(get-home-feed.ts의 다른 조회들과 동일하게)
// end_date >= 오늘인 활성 이벤트만 가져온다.
export async function getAllEvents(): Promise<NearbyItem[]> {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, event_type, location, location_precision, thumbnail_url, start_date, end_date, reservation_start_date, reservation_end_date, reservation_url, is_reservation_required, is_free, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, booking_status, venue_name, sigungu_name'
    )
    .eq('is_active', true)
    .gte('end_date', today)
    .order('start_date');

  if (error) {
    throw new Error(`전체 행사 목록 조회 실패: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    // PostGIS geometry는 PostgREST를 통해 GeoJSON으로 직렬화된다. location_precision='UNKNOWN'인
    // 행은 location 자체가 null이라(Decision 009) 좌표가 없다 — get-home-feed.ts와 동일하게
    // (0, 0)으로 폴백한다(이 화면은 지도가 아니라 카드 그리드라 좌표 미사용 카드는 문제되지 않음).
    const geometry = row.location as unknown as { coordinates: [number, number] } | null;
    const lng = geometry?.coordinates?.[0] ?? 0;
    const lat = geometry?.coordinates?.[1] ?? 0;

    return {
      id: row.id,
      name: row.title,
      category: row.event_type,
      distance_meters: -1,
      item_type: 'EVENT' as const,
      lng,
      lat,
      location_precision: row.location_precision as NearbyItem['location_precision'],
      address: row.venue_name,
      sigungu_name: row.sigungu_name,
      thumbnail_url: row.thumbnail_url,
      start_date: row.start_date,
      end_date: row.end_date,
      reservation_start_date: row.reservation_start_date,
      reservation_end_date: row.reservation_end_date,
      reservation_url: row.reservation_url,
      is_reservation_required: row.is_reservation_required,
      operating_hours: null,
      is_free: row.is_free,
      info_url: null,
      is_kids_friendly: row.is_kids_friendly,
      has_parking: row.has_parking,
      stroller_accessible: row.stroller_accessible,
      facility_type: row.facility_type,
      target_age_group: row.target_age_group,
      booking_status: row.booking_status,
    };
  });
}
