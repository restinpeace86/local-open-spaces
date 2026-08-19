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
  reservation_end_date: string | null;
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
