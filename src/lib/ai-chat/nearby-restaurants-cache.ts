// [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 4: "유저가 이 스팟 저 스팟
// 상세를 열어볼 때 동일한 맛집 정보를 매번 서버에 중복 요청하고 있는지" 점검한 결과 —
// 이 챗봇의 "🍽 근처 키즈친화 맛집 보기" 조회는 개별 결과 스팟이 아니라 사용자 자신의
// 위치(center) 하나만을 기준으로 하는 세션 단일 조회다(스팟별 조회가 아님 — 실제
// 구현 확인). 그럼에도 React 컴포넌트 state에만 캐시를 두면 바텀시트를 닫았다 다시 열
// 때마다(컴포넌트 언마운트/리마운트로 state가 초기화됨) 좌표가 그대로인데도 서버에
// 다시 요청하는 중복이 생긴다 — 모듈 스코프(컴포넌트 생명주기 밖) 캐시로 옮겨 페이지를
// 새로고침하기 전까지는 같은 좌표를 두 번 요청하지 않게 한다. 동시에 여러 번 트리거돼도
// (예: 빠르게 두 번 클릭) 진행 중인 Promise 자체를 캐싱해 중복 네트워크 요청을 막는다.
import { NearbyItem } from '@/lib/spaces/get-nearby';

type NearbyRestaurantsResult = { items: NearbyItem[]; radiusMeters: number };

const cache = new Map<string, Promise<NearbyRestaurantsResult>>();

// 좌표를 4자리(약 11m 오차)로 반올림해 캐시 키로 쓴다 — 이 정도 오차는 5km/도보 단위
// 반경 검색 결과에 실질적인 영향을 주지 않으면서, 부동소수점 표기 차이(예: 37.5665 vs
// 37.56650001)로 캐시가 무의미하게 갈라지는 것을 막는다.
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function getCachedNearbyRestaurants(
  lat: number,
  lng: number,
  fetcher: () => Promise<NearbyRestaurantsResult>
): Promise<NearbyRestaurantsResult> {
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = fetcher().catch((err) => {
    cache.delete(key); // 실패한 요청은 캐싱하지 않는다 — 다음 클릭에서 재시도 가능해야 함
    throw err;
  });
  cache.set(key, promise);
  return promise;
}

// 테스트 전용 — 모듈 스코프 캐시가 테스트 간에 새어나가지 않도록 초기화한다.
export function clearNearbyRestaurantsCache(): void {
  cache.clear();
}
