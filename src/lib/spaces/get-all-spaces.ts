import { createClient } from '@/lib/supabase/client';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// 지역별 도감 그리드는 반경 검색이 아닌 전체 카탈로그 탐색이므로
// get_nearby_spaces_and_events RPC 대신 open_spaces 테이블을 직접 조회한다.
export async function getAllOpenSpaces(referencePoint: { lat: number; lng: number }): Promise<NearbyItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('open_spaces')
    .select(
      'id, name, category, address, location, is_free, operating_hours, info_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group'
    )
    .order('name');

  if (error) {
    throw new Error(`전체 공간 목록 조회 실패: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    // PostGIS geometry는 PostgREST를 통해 GeoJSON으로 직렬화된다.
    const geometry = row.location as unknown as { coordinates: [number, number] } | null;
    const lng = geometry?.coordinates?.[0] ?? 0;
    const lat = geometry?.coordinates?.[1] ?? 0;

    return {
      id: row.id,
      name: row.name,
      category: row.category,
      distance_meters: haversineDistanceMeters(referencePoint, { lat, lng }),
      item_type: 'SPACE' as const,
      lng,
      lat,
      address: row.address,
      thumbnail_url: null,
      start_date: null,
      end_date: null,
      reservation_start_date: null,
      reservation_end_date: null,
      reservation_url: null,
      is_reservation_required: null,
      operating_hours: row.operating_hours,
      is_free: row.is_free,
      info_url: row.info_url,
      is_kids_friendly: row.is_kids_friendly,
      has_parking: row.has_parking,
      stroller_accessible: row.stroller_accessible,
      facility_type: row.facility_type,
      target_age_group: row.target_age_group,
      booking_status: null,
    };
  });
}
