import { createClient } from '@/lib/supabase/client';

export type NearbyItem = {
  id: string;
  name: string;
  category: string;
  distance_meters: number;
  item_type: 'SPACE' | 'EVENT';
  lng: number;
  lat: number;
  address: string | null;
  thumbnail_url: string | null;
  start_date: string | null;
  end_date: string | null;
  reservation_start_date: string | null;
  reservation_end_date: string | null;
  reservation_url: string | null;
  is_reservation_required: boolean | null;
  operating_hours: string | null;
  is_free: boolean | null;
  info_url: string | null;
  is_kids_friendly: boolean | null;
  has_parking: boolean | null;
  stroller_accessible: boolean | null;
  facility_type: string | null;
  target_age_group: string | null;
  booking_status: string | null;
  // Task 9-1-3: 홈 피드 전용(반경/거리 계산 제거 후 위치 표기용) — get_nearby_spaces_and_events
  // RPC 결과에는 아직 없어 optional로 둔다(있으면 사용, 없으면 formatVenueLine이 거리로 대체).
  sigungu_name?: string | null;
  // Task 9-5-1(2026-08-22): 목적별 테마 스팟 분류(src/lib/theme-spots.ts)용 — get_nearby_spaces_and_events
  // RPC(이 Task 범위 밖) 결과에는 없어 optional. 홈/카테고리 화면 경로만 채워 넣는다.
  source_type?: string | null;
  // Task 9-6-2(2026-08-23, Decision 009): 'EXACT'(실제 주소 지오코딩) | 'CITY_APPROX'(시/군
  // 중심좌표 근사) | 'UNKNOWN'(좌표 없음). get_nearby_spaces_and_events RPC는 EXACT만 반환하므로
  // 이 필드가 없고(undefined), open_spaces도 컬럼 자체가 없어 undefined다 — undefined는 EXACT로
  // 간주한다(DetailModal 등 소비 측 규약). get-home-feed.ts의 events 조회 경로만 실제 값을 채운다.
  location_precision?: 'EXACT' | 'CITY_APPROX' | 'UNKNOWN' | null;
};

export async function getNearbySpacesAndEvents(
  lng: number,
  lat: number,
  radiusMeters: number
): Promise<NearbyItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('get_nearby_spaces_and_events', {
    user_lng: lng,
    user_lat: lat,
    radius_meters: radiusMeters,
  });

  if (error) {
    throw new Error(`주변 공간/행사 조회 실패: ${error.message}`);
  }

  return (data ?? []) as NearbyItem[];
}
