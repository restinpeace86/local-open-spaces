import { createClient } from '@/lib/supabase/client';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// 월별 캘린더 뷰: 해당 월과 기간이 겹치는 모든 행사를 조회한다 (반경 무관).
export async function getEventsForMonth(year: number, month: number): Promise<NearbyItem[]> {
  const supabase = createClient();

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, event_type, location, thumbnail_url, start_date, end_date, reservation_start_date, reservation_end_date, reservation_url, is_reservation_required'
    )
    .lte('start_date', monthEnd)
    .gte('end_date', monthStart)
    .eq('is_active', true);

  if (error) {
    throw new Error(`월별 행사 조회 실패: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const geometry = row.location as unknown as { coordinates: [number, number] } | null;
    const lng = geometry?.coordinates?.[0] ?? 0;
    const lat = geometry?.coordinates?.[1] ?? 0;

    return {
      id: row.id,
      name: row.title,
      category: row.event_type,
      distance_meters: -1, // 캘린더 뷰는 위치 무관 탐색이라 거리 정보 없음을 음수로 표시

      item_type: 'EVENT' as const,
      lng,
      lat,
      address: null,
      thumbnail_url: row.thumbnail_url,
      start_date: row.start_date,
      end_date: row.end_date,
      reservation_start_date: row.reservation_start_date,
      reservation_end_date: row.reservation_end_date,
      reservation_url: row.reservation_url,
      is_reservation_required: row.is_reservation_required,
      operating_hours: null,
      is_free: null,
      info_url: null,
    };
  });
}
