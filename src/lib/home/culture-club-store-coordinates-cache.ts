import { createAdminClient } from '@/lib/supabase/admin';

// [성능 최적화 — 지점 좌표 캐싱](2026-10-07 사용자 지적: "성능 너무 느린데?
// Branch-First로 최적화 안 되어 있는거 같아") — 실측으로 원인을 찾았다:
// get_culture_club_store_coordinates() RPC 자체가 124개뿐인 가벼운 조회인데도
// 왕복에만 ~600ms가 걸린다(Supabase 원격 호출 고정 지연 — 행 수와 무관).
// 이 RPC는 검색 API뿐 아니라 지점 선택 API(stores/lottemart-stores)도 매
// 요청마다 호출해, 사용자가 반경/브랜드를 바꿀 때마다 이 고정 지연이
// 계속 반복됐다. 지점 좌표는 지오코딩이 끝난 뒤 거의 바뀌지 않는 정적
// 데이터라, 짧은 TTL로 메모리에 캐싱해 같은 서버 인스턴스에서의 반복
// 요청은 이 왕복을 건너뛰게 한다.
export type StoreCoordinate = { external_id: string; lng: number; lat: number };

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { data: StoreCoordinate[]; fetchedAt: number } | null = null;

export async function getCachedStoreCoordinates(): Promise<StoreCoordinate[]> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('get_culture_club_store_coordinates');
  if (error) throw new Error(error.message);
  cached = { data: data ?? [], fetchedAt: Date.now() };
  return cached.data;
}

// 테스트 전용 — 캐시 상태가 테스트 간에 새어나가지 않게 초기화한다.
export function __resetStoreCoordinatesCacheForTest() {
  cached = null;
}
