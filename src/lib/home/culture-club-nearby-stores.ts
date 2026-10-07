import { createAdminClient } from '@/lib/supabase/admin';
import { haversineDistanceMeters } from '@/lib/geo/haversine';

// [계층형 지점 선택 — 반경 내 지점만 노출](2026-10-07 todo.md 개선사항1-3):
// "전체 지점이 나오는 게 아니라 사용자가 설정한 거리 반경 내로 필터링된
// 지점들만 뱃지 형태로 나열" — 지점 선택 API(이마트/롯데마트 각각)가 공통으로
// 쓰는 "지점 좌표 → 거리 계산" 로직을 한 곳에 둔다(/api/culture-club/search의
// Branch-First 거리 계산과 같은 get_culture_club_store_coordinates RPC를
// 재사용 — 제5장 제4조, 중복 금지).
export async function getStoreDistancesByCode(
  externalIdPrefix: string,
  center: { lat: number; lng: number }
): Promise<Map<string, number>> {
  const supabase = createAdminClient();
  const { data: coords, error } = await supabase.rpc('get_culture_club_store_coordinates');
  if (error) throw new Error(error.message);

  const distances = new Map<string, number>();
  for (const c of coords ?? []) {
    if (!c.external_id.startsWith(externalIdPrefix)) continue;
    const storeCode = c.external_id.slice(externalIdPrefix.length);
    distances.set(storeCode, haversineDistanceMeters(center, c));
  }
  return distances;
}
