// [개선사항10 - 중복 스팟 그룹핑](2026-09-04 todo.md): DB RPC(find_spot_dedup_candidates,
// scripts/migrations/2026-09-04-find-spot-dedup-candidates-rpc.sql)가 돌려주는 후보
// 행에는 서로 다른 두 가지 "중복 의심" 근거(정규화 주소 일치 / 좌표 근접 클러스터)가
// 함께 실려 있다 — 이 두 근거 중 하나라도 겹치면 같은 그룹으로 합쳐야 하는데(예: A-B가
// 주소로 묶이고 B-C가 좌표로 묶이면 A-B-C가 한 그룹), 이런 "연결된 요소" 병합은 SQL
// GROUP BY 하나로는 표현할 수 없어 유니온-파인드(Union-Find)로 애플리케이션 레벨에서
// 처리한다. 순수 함수로 분리해 API 라우트 없이도 테스트할 수 있게 한다.
export type DedupCandidateRow = {
  id: string;
  name: string;
  category: string;
  category_min: string | null;
  address: string | null;
  normalized_address: string;
  lat: number | null;
  lng: number | null;
  proximity_cluster_id: number | null;
};

export type DedupGroup = {
  // 그룹을 대표하는 키 — 이 세션 한정으로만 안정적이면 충분하다(DB에 미리 존재하는
  // 값이 아니라, 후보 조회 시점에 union-find로 새로 만들어지는 임시 묶음이기 때문).
  groupKey: string;
  members: DedupCandidateRow[];
};

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // 경로 압축(path compression) — 반복 조회 시 트리 깊이를 얕게 유지.
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

// 후보 행 목록을 받아 "정규화 주소가 같거나(빈 문자열 제외) 좌표 근접 클러스터가 같은
// (null 제외) 행들"을 하나의 연결된 그룹으로 묶는다. 최종적으로 2건 이상인 그룹만
// "중복 의심 그룹"으로 반환한다(1건짜리는 애초에 "중복"이 아니다).
export function groupDedupCandidates(rows: DedupCandidateRow[]): DedupGroup[] {
  const uf = new UnionFind();
  for (const row of rows) uf.find(row.id); // 모든 행을 최소 자기 자신 그룹으로 등록

  const byNormalizedAddress = new Map<string, string[]>();
  const byProximityCluster = new Map<number, string[]>();
  for (const row of rows) {
    if (row.normalized_address) {
      const list = byNormalizedAddress.get(row.normalized_address) ?? [];
      list.push(row.id);
      byNormalizedAddress.set(row.normalized_address, list);
    }
    if (row.proximity_cluster_id != null) {
      const list = byProximityCluster.get(row.proximity_cluster_id) ?? [];
      list.push(row.id);
      byProximityCluster.set(row.proximity_cluster_id, list);
    }
  }

  for (const ids of byNormalizedAddress.values()) {
    for (let i = 1; i < ids.length; i += 1) uf.union(ids[0], ids[i]);
  }
  for (const ids of byProximityCluster.values()) {
    for (let i = 1; i < ids.length; i += 1) uf.union(ids[0], ids[i]);
  }

  const groups = new Map<string, DedupCandidateRow[]>();
  for (const row of rows) {
    const root = uf.find(row.id);
    const list = groups.get(root) ?? [];
    list.push(row);
    groups.set(root, list);
  }

  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([groupKey, members]) => ({ groupKey, members }));
}

// 관리자 목록에서 그룹을 한눈에 알아볼 수 있는 짧은 라벨 — 요구사항 예시
// ("경기도 성남시... 외 2건") 그대로.
export function formatDedupGroupLabel(group: DedupGroup): string {
  const first = group.members[0];
  const shortAddress = first.address ? first.address.split(' ').slice(0, 2).join(' ') : first.name;
  const extraCount = group.members.length - 1;
  return extraCount > 0 ? `${shortAddress} 등 ${first.name} 외 ${extraCount}건` : shortAddress;
}
