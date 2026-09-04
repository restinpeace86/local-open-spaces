// [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시) 그룹을 식별하는 결정적
// (deterministic) 키. DedupGroup.groupKey(유니온파인드 루트 id)는 스캔할 때마다 달라질 수
// 있어(누적된 후보 목록/합쳐지는 순서에 따라 바뀜) 임시 저장 테이블의 안정적인 식별자로
// 쓸 수 없다 — 대신 구성원 id 집합을 정렬해 이어붙인 문자열을 쓴다: 같은 스팟 집합이면
// 스캔 순서나 몇 번째 페이지에서 합쳐졌는지와 무관하게 항상 같은 키가 나온다.
//
// 클라이언트(spot-dedup-panel.tsx)와 서버(apply/route.ts, pending-groups/route.ts) 양쪽에서
// 이 함수를 그대로 공유해야 한다 — "그룹을 최종 등록하면 임시 테이블에서 해당 행이 삭제된다"
// 요구사항이 정확히 같은 키로 매칭되는 것에 의존하기 때문이다.
export function buildPendingGroupKey(memberSpotIds: string[]): string {
  return [...memberSpotIds].sort().join(',');
}
