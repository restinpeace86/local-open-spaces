// Task 9-5-1(2026-08-22): 목적/장소별 테마 스팟 그룹화 — 5대 UI 카테고리(EXPERIENCE_CLASS 등)
// 와는 다른 축의 분류다. 하나의 UI 카테고리 안에도 "물놀이"/"캠핑"처럼 목적이 다른 데이터가
// 섞여 있어(예: KOR_TOUR_API_V4가 OUTDOOR_NATURE/KIDS_ACTIVITY/EXHIBITION_MUSEUM 전반에
// 걸쳐 19,148건), source_type만으로 깔끔히 나뉘는 소스는 그대로 매핑하고, 여러 목적이 섞인
// 대형 소스(KOR_TOUR_API_V4/GG_EVENTS/PUBLIC_FACILITY_OPEN 등)는 장소/행사명 키워드로
// 추가 분류한다. 어느 규칙에도 안 걸리면 null(추측으로 임의 테마에 배정하지 않음).

export type ThemeSpotKey =
  | 'SWIMMING'
  | 'PLAYGROUND_KIDS'
  | 'PARK_WALK'
  | 'FOREST_RECREATION'
  | 'AMUSEMENT_ACTIVITY'
  | 'CULTURE_SPORTS';

export const THEME_SPOT_OPTIONS: { key: ThemeSpotKey; label: string; emoji: string }[] = [
  { key: 'SWIMMING', label: '물놀이·수영장', emoji: '🏊' },
  { key: 'PLAYGROUND_KIDS', label: '놀이터·키즈', emoji: '🛝' },
  { key: 'PARK_WALK', label: '공원·산책', emoji: '🌳' },
  { key: 'FOREST_RECREATION', label: '숲·휴양림', emoji: '🌲' },
  { key: 'AMUSEMENT_ACTIVITY', label: '유원지·액티비티', emoji: '🎡' },
  { key: 'CULTURE_SPORTS', label: '문화·체육', emoji: '🏛️' },
];

export function isThemeSpotKey(value: string): value is ThemeSpotKey {
  return THEME_SPOT_OPTIONS.some((opt) => opt.key === value);
}

// 실측 확인(2026-08-22, 라이브 DB source_type × category × facility_type 집계): 아래 소스는
// 해당 테마 하나로만 사실상 전량 구성돼 있어(예: SWIMMING_POOL 1,537건 전부 수영장) 안전하게
// 1:1 매핑한다. GO_CAMPING(3,087건, 캠핑장)은 산/숲 인접 야영지가 대부분이라 "숲·휴양림"으로,
// LOCALDATA_AMUSEMENT(2,507건, 유원시설업 인허가 데이터)는 정의상 그대로 "유원지·액티비티"로 묶는다.
const SOURCE_TYPE_THEME_MAP: Record<string, ThemeSpotKey> = {
  SWIMMING_POOL: 'SWIMMING',
  LOCALDATA_PLAYGROUND: 'PLAYGROUND_KIDS',
  PARK_API: 'PARK_WALK',
  NATIONAL_PARK_ECOTOUR: 'FOREST_RECREATION',
  GO_CAMPING: 'FOREST_RECREATION',
  LOCALDATA_AMUSEMENT: 'AMUSEMENT_ACTIVITY',
  CULTURE_FACILITY: 'CULTURE_SPORTS',
  CULTURAL_FACILITY_SUMMARY: 'CULTURE_SPORTS',
};

// KOR_TOUR_API_V4/GG_EVENTS/PUBLIC_FACILITY_OPEN처럼 여러 목적이 섞인 대형 소스는 장소/행사명
// 키워드로 세분화한다. 순서가 우선순위다 — 예를 들어 "국립공원"은 "공원"을 포함하지만 먼저
// 검사되는 FOREST_RECREATION 규칙에 걸려야 하므로 PARK_WALK보다 앞에 둔다.
const KEYWORD_RULES: { key: ThemeSpotKey; keywords: string[] }[] = [
  { key: 'SWIMMING', keywords: ['물놀이', '수영장', '워터파크', '아쿠아', '해수욕장', '풀빌라'] },
  { key: 'FOREST_RECREATION', keywords: ['휴양림', '자연휴양림', '숲', '국립공원', '산림욕', '캠핑', '야영장'] },
  {
    key: 'AMUSEMENT_ACTIVITY',
    keywords: ['놀이공원', '테마파크', '유원지', '워터슬라이드', '짚라인', '카트', '액티비티'],
  },
  {
    key: 'CULTURE_SPORTS',
    keywords: ['박물관', '미술관', '전시관', '전시실', '공연장', '체육관', '도서관', '문화회관', '문화센터'],
  },
  { key: 'PARK_WALK', keywords: ['공원', '산책로', '둘레길', '생태공원'] },
  { key: 'PLAYGROUND_KIDS', keywords: ['놀이터', '키즈카페', '플레이그라운드'] },
];

// Task 9-5-1: NearbyItem은 원래 source_type을 담지 않았으나(get-nearby.ts), 이 분류를 위해
// 홈/카테고리 화면 경로(get-home-feed.ts, get-all-spaces.ts)에서 선택적으로 채워 넣는다
// (지도 탐색용 get_nearby_spaces_and_events RPC는 이 Task 범위가 아니라 손대지 않음 — optional
// 이라 없으면 키워드 매칭만으로 동작).
export function classifyThemeSpot(item: { name: string; source_type?: string | null }): ThemeSpotKey | null {
  // source_type이 확정적인 소스는 그대로 신뢰한다 — 키워드를 먼저 보면 실측으로 확인한 실제
  // 사례(LOCALDATA_PLAYGROUND 명칭이 흔히 "OO어린이공원"처럼 "공원"을 포함)가 엉뚱한 테마로
  // 잘못 분류된다. 키워드 매칭은 source_type만으로 확정할 수 없는 대형 혼합 소스에서만 쓴다.
  if (item.source_type) {
    const mapped = SOURCE_TYPE_THEME_MAP[item.source_type];
    if (mapped) return mapped;
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => item.name.includes(kw))) return rule.key;
  }

  return null;
}

// Task 9-5-1: 서버 쿼리(get-home-feed.ts, events용)에서 SQL 단에 바로 걸 수 있는 PostgREST
// `.or()` 키워드 ILIKE 필터 문자열을 만든다. events 테이블에는 source_type 컬럼이 아예 없어
// (실측 확인 — buildEventRow 주석 참고: 소스 구분은 external_id 접두어 관례로만 함) 키워드
// 조건만 건다.
export function buildThemeKeywordFilter(theme: ThemeSpotKey, nameColumn: string): string {
  const keywords = KEYWORD_RULES.find((rule) => rule.key === theme)?.keywords ?? [];
  return keywords.map((kw) => `${nameColumn}.ilike.%${kw}%`).join(',');
}

// 그 테마로 확정적인 source_type 목록(있으면 인덱스로 즉시 걸러진다).
export function confidentSourceTypesFor(theme: ThemeSpotKey): string[] {
  return Object.entries(SOURCE_TYPE_THEME_MAP)
    .filter(([, mappedTheme]) => mappedTheme === theme)
    .map(([sourceType]) => sourceType);
}

// Task 9-5-1(2026-08-22) 실측에서 발견한 성능 문제: open_spaces(약 13만 건)에서
// "source_type.in.(...) OR name.ilike.%키워드%"처럼 하나의 OR 조건절에 인덱스 있는 조건과
// ILIKE 조건을 섞으면, 옵티마이저가 어느 쪽으로도 인덱스를 못 써 전체를 순차 스캔한다
// (EXPLAIN ANALYZE 확인: 4초 이상, 지역 필터까지 더하면 타임아웃). 반면 source_type이
// 확정적이지 않은 대형 혼합 소스로 범위를 먼저 좁힌 뒤(source_type 인덱스 사용) 그 안에서만
// ILIKE를 걸면(AND 결합) 같은 조건이 0.5초 내로 끝난다(실측 확인). 그래서 open_spaces는
// "확정 source_type IN" 쿼리와 "혼합 소스 한정 키워드 ILIKE" 쿼리를 분리해 각각 인덱스를 태운다.
export const AMBIGUOUS_SPACE_SOURCE_TYPES = ['KOR_TOUR_API_V4', 'GG_EVENTS', 'PUBLIC_FACILITY_OPEN'];
