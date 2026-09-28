import { OPEN_SPACES_GROUPS_STATIC } from './category-min-groups';

// [개선사항10 - 중복 스팟 그룹핑](2026-09-04 todo.md): DB RPC(find_spot_dedup_candidates)가
// 돌려주는 후보 행을 "정규화 주소 일치" 또는 "좌표 근접"이라는 두 근거 중 하나라도
// 겹치면 같은 그룹으로 합친다(예: A-B가 주소로 묶이고 B-C가 좌표로 묶이면 A-B-C가 한
// 그룹) — 이런 "연결된 요소" 병합은 SQL GROUP BY 하나로는 표현할 수 없어 유니온-파인드
// (Union-Find)로 애플리케이션 레벨에서 처리한다. 순수 함수로 분리해 API 라우트 없이도
// 테스트할 수 있게 한다.
//
// [2026-09-05 좌표 근접 판정을 서버(SQL)에서 클라이언트(TS)로 이전] 사용자가 실제
// 데이터로 지적한 사례를 실측 재현한 결과 두 가지 문제를 확인했다:
// ① SQL의 ST_ClusterDBSCAN이 위경도(degree) 좌표를 그대로 유클리드 거리로 비교해
//    부정확했다 — "물빛어린이공원 바닥분수"~"판교제2호(물빛)공원"은 실제
//    26.2m(ST_Distance(geography)로 직접 확인)인데 degree 기반 근사 임계값을 근소하게
//    벗어나 놓쳤다.
// ② 더 치명적으로, 2026-09-04에 도입한 페이지네이션이 `id`(사실상 무작위 uuid) 순으로
//    스캔해 실제로 가까운 두 행이 같은 배치에 함께 걸릴 확률이 142,113건 중 사실상
//    0에 가까웠다 — "성남시운중도서관"~"운중도서관 시청각실"(실제 6.9m)처럼 명백한
//    중복조차 놓쳤다.
// 해결책: RPC는 이제 좌표 근접을 미리 계산하지 않고 원시 lat/lng만 돌려주며, 스캔
// 순서를 ST_GeoHash 기반 공간 순서로 바꿔 가까운 행들이 몇 번의 "더 보기" 안에
// 함께 스캔되도록 유도한다(2026-09-05-spot-dedup-geohash-scan-and-accurate-distance.sql).
// 실제 근접 판정은 이 파일이 Haversine 공식(실제 지구 반지름 기준 정확한 미터 거리)으로
// **누적된 전체 후보**를 대상으로 다시 계산한다 — 배치 경계에 걸려도 두 후보가 일단
// (어느 페이지에서든) 한 번씩만 스캔되면 정확하게 합쳐진다.
export type DedupCandidateRow = {
  id: string;
  name: string;
  category: string;
  category_min: string | null;
  address: string | null;
  normalized_address: string;
  lat: number | null;
  lng: number | null;
};

export type DedupGroup = {
  // 그룹을 대표하는 키 — 이 세션 한정으로만 안정적이면 충분하다(DB에 미리 존재하는
  // 값이 아니라, 후보 조회 시점에 union-find로 새로 만들어지는 임시 묶음이기 때문).
  groupKey: string;
  members: DedupCandidateRow[];
};

// "동일 스팟으로 볼" 실제 거리 임계값 — 장표(todo.md 개선사항10)가 명시한 "반경
// 20~30m"의 상한을 그대로 쓴다. Haversine 공식으로 계산하는 실제 지구 표면 거리라
// degree 근사와 달리 위도/경도 방향에 따른 오차가 없다.
const PROXIMITY_THRESHOLD_METERS = 30;

// [건물형 시설 임계값 확대](2026-09-29 사용자 지시): "30m에서 건물형 시설은 좀
// 넓힐까? 어차피 중복에 대하여체크는 내가 직접하잖아" — 실측 재현(어린이도서관
// 미병합 4쌍)으로 확인한 원인: 같은 건물이라도 원본 소스마다 지오코딩이 30m보다
// 훨씬 크게 벌어질 수 있다(노원 36.3m/국립 55.3m/아리랑 118.2m/지혜샘 136.8m,
// 전부 실제 Haversine 거리). 야외 시설(공원/놀이터 등)은 부지가 넓어 30m가 이미
// 관대한 편이라 그대로 두고, "건물형" 표준중분류만 넓힌다 — 이 판정 결과는 최종
// 자동 병합이 아니라 "후보로 띄우는" 데만 쓰이고 관리자가 매번 직접 확인 후
// 저장하므로(제5장 제11조와 달리 여기는 사용자가 이미 위험을 감수하겠다고 확정),
// 오탐(candidate)이 늘어도 최종 데이터가 잘못 합쳐지는 위험은 없다. 150m는 실측
// 최대값(136.8m)에 여유를 더한 값이다. 카테고리 목록은 category-min-groups.ts의
// '문화시설' 대분류(도서관/어린이도서관/미술관/박물관/과학관 등 실내 건물형 시설)를
// 그대로 재사용한다(제5장 제4조 기존 구조 우선 — 같은 분류를 두 곳에 따로 유지하면
// 나중에 한쪽만 고쳐 어긋난다).
const BUILDING_TYPE_PROXIMITY_THRESHOLD_METERS = 150;
const BUILDING_TYPE_CATEGORY_MINS = new Set(
  OPEN_SPACES_GROUPS_STATIC.find((g) => g.major === '문화시설')?.minors ?? []
);

function getProximityThresholdMeters(categoryMin: string | null): number {
  return categoryMin && BUILDING_TYPE_CATEGORY_MINS.has(categoryMin)
    ? BUILDING_TYPE_PROXIMITY_THRESHOLD_METERS
    : PROXIMITY_THRESHOLD_METERS;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Haversine 공식 — 두 좌표(위경도, degree) 사이의 실제 지구 표면 거리(미터)를 계산한다.
// PostGIS의 geography 타입 거리 계산과 동일한 구면 모델을 쓴다(지구를 완전한 구로
// 근사 — 타원체 보정까지는 이 용도(30m 임계값 판정)에 필요하지 않은 정밀도라 생략).
export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

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

// 후보 행 목록을 받아 "정규화 주소가 같거나(빈 문자열 제외) 실제 거리 30m 이내인"
// 행들을 하나의 연결된 그룹으로 묶는다. 최종적으로 2건 이상인 그룹만 "중복 의심
// 그룹"으로 반환한다(1건짜리는 애초에 "중복"이 아니다).
//
// [성능 참고] 좌표 비교는 O(n²)다 — 누적 후보 수가 매우 커지면(수만 건) 느려질 수
// 있지만, 이 도구는 관리자가 "더 보기"를 눌러 점진적으로 늘려가는 대화형 검수
// 큐라 실사용 범위(수백~수천 건)에서는 문제없다. 훨씬 커지면 좌표를 격자/geohash
// 버킷으로 미리 나눠 버킷 내부만 비교하는 최적화를 추가로 고려할 수 있다.
export function groupDedupCandidates(rows: DedupCandidateRow[]): DedupGroup[] {
  const uf = new UnionFind();
  for (const row of rows) uf.find(row.id); // 모든 행을 최소 자기 자신 그룹으로 등록

  const byNormalizedAddress = new Map<string, string[]>();
  for (const row of rows) {
    if (row.normalized_address) {
      const list = byNormalizedAddress.get(row.normalized_address) ?? [];
      list.push(row.id);
      byNormalizedAddress.set(row.normalized_address, list);
    }
  }
  for (const ids of byNormalizedAddress.values()) {
    for (let i = 1; i < ids.length; i += 1) uf.union(ids[0], ids[i]);
  }

  const withCoords = rows.filter((r) => r.lat != null && r.lng != null);
  for (let i = 0; i < withCoords.length; i += 1) {
    for (let j = i + 1; j < withCoords.length; j += 1) {
      const a = withCoords[i];
      const b = withCoords[j];
      // 둘 중 하나라도 건물형 표준중분류면 더 넓은 임계값을 적용한다 — 미매핑
      // 스캔(category_min이 서로 다를 수 있음)에서도 안전하게 동작하도록 둘 중
      // 더 큰 값을 쓴다.
      const threshold = Math.max(getProximityThresholdMeters(a.category_min), getProximityThresholdMeters(b.category_min));
      if (haversineDistanceMeters(a.lat!, a.lng!, b.lat!, b.lng!) <= threshold) {
        uf.union(a.id, b.id);
      }
    }
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
