import { createClient } from '@/lib/supabase/server';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import {
  AMBIGUOUS_SPACE_SOURCE_TYPES,
  buildThemeKeywordFilter,
  confidentSourceTypesFor,
  ThemeSpotKey,
} from '@/lib/theme-spots';

// Task 9-1(2026-08-22): 홈 화면 Hero Carousel/큐레이션 피드용 서버 사이드 조회 로직.
// /api/home/feed 라우트와 홈 페이지 Server Component가 이 함수들을 공유해서 쓴다
// (같은 로직을 두 번 구현하지 않고, API 라우트가 Server Component 안에서 자기 자신을
// fetch하는 안티패턴도 피한다).
//
// Task 9-1-3(2026-08-22): 매 요청마다 좌표 간 Haversine 거리를 계산해 반경 30km로 필터링하던
// 방식(Task 9-1-1)을 완전히 제거했다. 대신 인덱싱된 sigungu_name 컬럼 값으로 "유저가 선택한
// 지역"을 1순위로, 그 외 지역을 2순위로 재정렬한다(제외하지 않음 — 지역 데이터가 적은 사용자도
// 피드가 텅 비지 않도록). 이 방식은 애플리케이션 레벨의 삼각함수 계산이 전혀 없어 응답이 더 빠르다.
//
// 사용자 피드백(2026-08-22): 위치가 "설정/재설정"되어 실제 좌표(lat/lng)를 알게 된 경우에는,
// 이미 뽑아둔(Strict Location-First로 걸러진) 소규모 후보군 안에서만 실제 거리순으로 재정렬한다.
// 이는 Task 9-1-3에서 없앤 "매 요청마다 전체 후보를 Haversine으로 필터링"하는 것과는 다르다 —
// 위치 미설정 상태(기본값)의 익명 요청에는 전혀 적용되지 않고, 좌표를 아는 소수의 요청에서만
// 이미 축소된 배열(최대 수십 건)에 대해서만 도는 가벼운 정렬이라 성능에 영향이 없다.

export type HomeRegion = { sigunguName: string | null; lat?: number; lng?: number };

// Task 9-1-1에서 정한 기본값(성남시 분당구 — 실제 지오코딩된 자사 DB 좌표 기준)의 지역명을
// 그대로 계승한다(추측 없음). 위치 미설정 상태를 나타내므로 lat/lng는 일부러 넣지 않는다.
export const DEFAULT_HOME_REGION: HomeRegion = { sigunguName: '성남시 분당구' };

function extractCoords(location: unknown): { lng: number; lat: number } {
  const geometry = location as { coordinates: [number, number] } | null;
  return { lng: geometry?.coordinates?.[0] ?? 0, lat: geometry?.coordinates?.[1] ?? 0 };
}

const EVENT_COLUMNS =
  'id, title, event_type, location, thumbnail_url, start_date, end_date, reservation_start_date, reservation_end_date, reservation_url, is_reservation_required, is_free, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, booking_status, venue_name, sigungu_name';

type EventRow = {
  id: string;
  title: string;
  event_type: string;
  location: unknown;
  thumbnail_url: string | null;
  start_date: string;
  end_date: string;
  reservation_start_date: string | null;
  reservation_end_date: string | null;
  reservation_url: string | null;
  is_reservation_required: boolean | null;
  is_free: boolean | null;
  is_kids_friendly: boolean | null;
  has_parking: boolean | null;
  stroller_accessible: boolean | null;
  facility_type: string | null;
  target_age_group: string | null;
  booking_status: string | null;
  venue_name: string | null;
  sigungu_name: string | null;
};

function toEventItem(row: EventRow): NearbyItem {
  const { lng, lat } = extractCoords(row.location);
  return {
    id: row.id,
    name: row.title,
    category: row.event_type,
    // Task 9-1-3: 더 이상 거리를 계산하지 않는다 — -1 sentinel(기존 컴포넌트들이 이미
    // "거리 정보 없음"으로 처리하는 관례값)을 그대로 쓴다.
    distance_meters: -1,
    item_type: 'EVENT',
    lng,
    lat,
    // Task 9-1-1: events.venue_name 컬럼(원본 API의 실제 장소명 필드 백필)을 NearbyItem.address에
    // 담아 SpaceGridCard/EventCard가 같은 필드로 "장소"를 표시하도록 한다(타입 변경 없이 재사용).
    address: row.venue_name,
    sigungu_name: row.sigungu_name,
    thumbnail_url: row.thumbnail_url,
    start_date: row.start_date,
    end_date: row.end_date,
    reservation_start_date: row.reservation_start_date,
    reservation_end_date: row.reservation_end_date,
    reservation_url: row.reservation_url,
    is_reservation_required: row.is_reservation_required,
    operating_hours: null,
    is_free: row.is_free,
    info_url: null,
    is_kids_friendly: row.is_kids_friendly,
    has_parking: row.has_parking,
    stroller_accessible: row.stroller_accessible,
    facility_type: row.facility_type,
    target_age_group: row.target_age_group,
    booking_status: row.booking_status,
  };
}

// Task 9-1-8: "용산ZINE: 맛있는 용산 이야기 8월~10월 예약 안내 (4~6학년 대상)"처럼 회차/대상별로
// 제목 뒷부분만 다른 시리즈물, "(주말가족) 8월 대모산유아숲"/"(주말가족)대모산유아숲"처럼 앞에
// 붙는 회차 라벨만 다른 반복 프로그램을 같은 항목으로 묶기 위한 제목 핵심 키 추출.
// 1) 맨 앞의 "(라벨)"/"[라벨]" 형태 접두 라벨 제거 — 예: "(주말가족) " 제거
// 2) 남은 문자열 맨 앞의 "숫자+월" 토큰 제거 — 예: "8월 " 제거
// 3) 첫 ':' 또는 '(' 이후는 회차/주제/대상 정보로 간주해 버림 — 예: "용산ZINE: ..." → "용산ZINE"
// 잘라낸 결과가 비면(제목 전체가 괄호였던 경우 등) 원본 제목을 그대로 쓴다.
function normalizeTitleKey(name: string): string {
  const withoutLeadingLabel = name.trim().replace(/^[([][^)\]]*[)\]]\s*/, '');
  const withoutMonthPrefix = withoutLeadingLabel.replace(/^\d+월\s*/, '');
  const cut = withoutMonthPrefix.split(/[:(]/)[0].trim();
  const core = cut || withoutMonthPrefix || name.trim();
  return core.toLowerCase().replace(/\s+/g, '');
}

// docs/spec.md 2.2 ③ / Task 9-1-3: "정규화된 (행사명/공간명 + 시군구)" 기준 중복 제거.
// Task 9-1-8: 제목을 정확히 일치가 아니라 위 핵심 키로 느슨하게 묶어(Fuzzy) 시리즈물/유사
// 반복 프로그램까지 대표 1건으로 통합한다. 동일 핵심 키 안에서 실제 지역(sigungu_name)이
// 서로 다른 값으로 2개 이상 섞여 있으면(진짜 다른 지역의 동명 이벤트일 수 있으므로) 지역별로
// 나눠서만 병합하고, sigungu_name이 없는(null) 항목만 있거나 지역이 하나로만 모이면 1건으로
// 합친다. 병합 시 가장 정보가 많은(주소/지역/썸네일이 채워진) 항목을 대표로 삼고, 하나라도
// is_free: true면 최종 카드를 is_free: true로 승격한다.
function completenessScore(item: NearbyItem): number {
  let score = 0;
  if (item.address) score += 1;
  if (item.sigungu_name) score += 1;
  if (item.thumbnail_url) score += 1;
  return score;
}

function mergeGroup(group: NearbyItem[]): NearbyItem {
  const base = group.reduce((best, cur) => (completenessScore(cur) > completenessScore(best) ? cur : best));
  const sigunguName = base.sigungu_name ?? group.find((i) => i.sigungu_name)?.sigungu_name ?? null;
  const isFree = group.some((i) => i.is_free === true);
  return { ...base, sigungu_name: sigunguName, is_free: isFree ? true : base.is_free };
}

function dedupeAndMergeFree(items: NearbyItem[]): NearbyItem[] {
  const byTitleKey = new Map<string, NearbyItem[]>();
  for (const item of items) {
    const key = normalizeTitleKey(item.name);
    const group = byTitleKey.get(key);
    if (group) group.push(item);
    else byTitleKey.set(key, [item]);
  }

  const result: NearbyItem[] = [];

  for (const group of byTitleKey.values()) {
    const distinctRegions = new Set(group.filter((i) => i.sigungu_name).map((i) => i.sigungu_name));

    if (distinctRegions.size <= 1) {
      result.push(mergeGroup(group));
      continue;
    }

    // 같은 제목 핵심 키에 서로 다른 실제 지역이 섞여 있으면(동명이지만 다른 지역의 별개
    // 행사/장소일 수 있음) 지역별로 나눠서만 병합한다 — sigungu_name이 없는 항목은 어느
    // 지역에 속하는지 알 수 없으므로 별도로 남긴다(임의 배정하지 않음).
    const byRegion = new Map<string, NearbyItem[]>();
    for (const item of group) {
      const regionKey = item.sigungu_name ?? '';
      const sub = byRegion.get(regionKey);
      if (sub) sub.push(item);
      else byRegion.set(regionKey, [item]);
    }
    for (const sub of byRegion.values()) {
      result.push(mergeGroup(sub));
    }
  }

  return result;
}

// Task 9-1-3/9-4-4: 유저가 선택한 지역(region.sigunguName)과 일치하는 항목을 우선 정렬한다
// (제외하지 않음). regionTier와 동일한 퍼지 토큰 매칭 규칙을 그대로 재사용해, "가성비 행복"
// 피드도 Hero Carousel과 같은 기준으로 sigungu_name 표기가 제각각이어도 정확히 우선순위가
// 매겨지도록 일관성을 맞춘다. Array.sort는 안정 정렬이므로 각 순위 그룹 내부의 기존 정렬
// (최신순 등)은 그대로 유지된다.
function byRegionPriority(region: HomeRegion) {
  return (a: NearbyItem, b: NearbyItem): number => regionTier(a, region) - regionTier(b, region);
}

// 사용자 피드백(2026-08-22): 유저가 위치를 설정/재설정해 실제 좌표(region.lat/lng)를 알게 되면
// 그 좌표에서 가까운 순서대로 노출한다. 좌표를 모르는 상태(기본값)에서는 아무 것도 하지 않고
// 기존 순서(최신순 등)를 그대로 둔다 — 안정 정렬이므로 이후 selectRegionFirst/byRegionPriority가
// 지역 우선순위로 다시 나눠도 각 그룹 내부의 "가까운 순"은 그대로 유지된다.
function sortByDistanceIfKnown(items: NearbyItem[], region: HomeRegion): NearbyItem[] {
  if (typeof region.lat !== 'number' || typeof region.lng !== 'number') return items;

  const origin = { lat: region.lat, lng: region.lng };
  return items
    .map((item) => ({
      ...item,
      distance_meters: haversineDistanceMeters(origin, { lat: item.lat, lng: item.lng }),
    }))
    .sort((a, b) => a.distance_meters - b.distance_meters);
}

// Task 9-4-4(2026-08-22) 실측에서 발견한 버그: sigungu_name이 지역에 따라 "성남시 분당구"/
// "성남시"만/(VWorld 역지오코딩 백필 전이라 NULL — Task 9-2-1/9-3-2에서 VWorld API 키가
// 일시 차단돼 아직 완료되지 못한 ~1,500건)처럼 제각각으로 적재돼 있어, 선택 지역과 문자열이
// "정확히" 일치하는 sigungu_name만 찾던 예전 방식(.eq())으로는 실제로 있는 당일 데이터도
// 0건으로 보일 수 있었다. sigungu_name은 "{시} {구}"(예: "성남시 분당구") 또는 구 없는 "{시}"
// 단독(예: "춘천시") 형태다(schema-mapper.mjs의 extractSigunguName과 동일 규칙) — 공백 뒤
// 마지막 토큰을 가장 구체적인("분당구") 토큰으로, 공백 앞 첫 토큰을 상위 시("성남시")로 본다
// (토큰이 하나뿐이면 그 자체가 이미 가장 구체적인 값이라 상위 토큰은 없음).
// 긴급 수리(Hotfix, 2026-08-22) 실측으로 재현한 버그: sigungu_name에 쉼표/괄호가 하나라도
// 섞여 있으면(예: Kakao 키워드 검색 결과 주소에 건물/층수 부기가 붙어 "OO동, OO빌딩"처럼
// 콤마가 남는 경우) 아래 regionOrFilter가 만드는 PostgREST `.or()` 필터 문자열이 깨져
// "failed to parse logic tree" 500 에러가 나고, 그 응답을 그대로 받는 홈 화면 클라이언트가
// 통째로 크래시했다(실측 재현: sigungu 쿼리 파라미터에 콤마 하나만 넣어도 /api/home/feed가
// 항상 500을 반환함). PostgREST `.or()` 문법에서 쉼표는 조건 구분자, 괄호는 in() 등에 쓰이는
// 예약 문자라 토큰에서 미리 제거한다 — ILIKE 부분 문자열 검색 의미상 이런 특수문자가 없어도
// 매칭에 지장이 없다.
function sanitizeRegionToken(token: string): string {
  return token.replace(/[,()]/g, '').trim();
}

function tokensOf(sigunguName: string): { specific: string; broad: string | null } {
  const tokens = sigunguName
    .trim()
    .split(/\s+/)
    .map(sanitizeRegionToken)
    .filter(Boolean);
  if (tokens.length === 0) return { specific: '', broad: null };
  const specific = tokens[tokens.length - 1];
  const broad = tokens.length > 1 ? tokens[0] : null;
  return { specific, broad };
}

// Task 9-4-4: sigungu_name뿐 아니라 주소 텍스트(NearbyItem.address — events는 venue_name,
// open_spaces는 address 컬럼이 매핑됨)에도 토큰이 부분 문자열로 포함돼 있으면 매칭으로 본다.
// sigungu_name이 비어있거나("NULL") 다른 표기라도, 원본 주소에 지역명이 들어있으면 찾아낸다.
function matchesToken(item: NearbyItem, token: string): boolean {
  return Boolean(item.sigungu_name?.includes(token)) || Boolean(item.address?.includes(token));
}

// Task 9-4-3/9-4-4: 메인 카드(Hero Carousel) 2단계 지역 큐레이션 우선순위.
// 0(1순위)=가장 구체적인 토큰(분당구) 매칭, 1(2순위)=상위 시 토큰(성남시)만 매칭, 2(3순위)=그 외.
// DB에 시/도(province) 컬럼이 별도로 없어(추측으로 새 컬럼/전국 매핑표를 만들지 않음, 제3장
// 제3조 데이터 구조 변경 금지) "성남시 전체"까지만 상위 지역으로 판별하고, "경기도" 같은
// 시/도 단위까지는 이 데이터만으로 구분할 수 없다.
function regionTier(item: NearbyItem, region: HomeRegion): 0 | 1 | 2 {
  if (!region.sigunguName) return 0;

  const { specific, broad } = tokensOf(region.sigunguName);
  if (matchesToken(item, specific)) return 0;
  if (broad && matchesToken(item, broad)) return 1;

  return 2;
}

// Task 9-1-6: Hero Carousel 전용 "Strict Location-First" 선택. byRegionPriority(정렬만 하고
// 배제하지 않음)와 달리, 선택 지역 항목만으로 limit이 충족되면 다른 지역 항목은 최종 결과에서
// 완전히 배제한다. 선택 지역 데이터가 부족할 때만 다른 지역 데이터로 남은 자리를 채운다.
// Task 9-4-3: 부족분을 채울 때도 아무 지역이나 뒤섞지 않고, 같은 상위 시(예: 성남시 전체)를
// 2순위로 먼저 채운 뒤에야 그 외 지역(3순위)으로 채운다. Array.sort는 안정 정렬이므로 각 순위
// 그룹 내부의 기존 정렬(거리순 등)은 그대로 유지된다 — 1순위만으로 limit이 채워지면 정렬 후
// slice 단계에서 2·3순위 항목은 자연히 결과에서 제외되어 기존 Strict 배제 동작도 유지된다.
function selectRegionFirst(items: NearbyItem[], region: HomeRegion, limit: number): NearbyItem[] {
  if (!region.sigunguName) return items.slice(0, limit);

  const ranked = [...items].sort((a, b) => regionTier(a, region) - regionTier(b, region));
  return ranked.slice(0, limit);
}

// Task 9-4-4: sigungu_name과 주소 텍스트(events는 venue_name, open_spaces는 address) 양쪽에
// ILIKE 부분 문자열 매칭을 거는 OR 필터 문자열을 만든다(PostgREST `.or()` 문법).
// 방어적으로 한 번 더 sanitizeRegionToken을 거친다(이 함수를 다른 경로에서 sanitize 없이
// 직접 호출하더라도 필터 문자열이 깨지지 않도록).
function regionOrFilter(token: string, textColumn: string): string {
  const safeToken = sanitizeRegionToken(token);
  return `sigungu_name.ilike.%${safeToken}%,${textColumn}.ilike.%${safeToken}%`;
}

// Task 9-1-4(2026-08-22) 실측에서 발견한 버그: open_spaces/events 후보군을 "최신순 500건"으로만
// 뽑으면, 한 소스가 다른 소스보다 더 최근에 대량 수집됐을 때(예: GG_EVENTS 1,199건이 가장 최근
// 수집돼 is_free=true 500건 후보 전량을 GG_EVENTS가 차지) 다른 지역 데이터가 후보군에서 통째로
// 밀려나 selectRegionFirst/byRegionPriority가 아무리 잘 짜여 있어도 무용지물이 된다(실측 확인:
// 성남시 분당구 기준 요청인데도 500건 후보가 전부 GG_EVENTS 소속 지역이었음).
// 그래서 "최신순으로 넉넉히 가져온 뒤 애플리케이션에서 지역별로 나눈다"가 아니라, 선택 지역을
// SQL 단에서 먼저 조회해(해당 지역 데이터가 얼마든 있든 후보군을 우선 확보) 다른 지역에 밀려나지
// 않게 한다.
// Task 9-4-4: 1단계로 정확히 일치(.eq())만 찾던 방식은 sigungu_name 표기가 제각각이면 0건을
// 반환할 수 있어(위 tokensOf/regionOrFilter 설명 참고), 이제 3단계로 점점 넓혀가며 조회한다.
// 1) 가장 구체적인 토큰(분당구) ILIKE, 2) 그래도 부족하면 상위 시 토큰(성남시) ILIKE,
// 3) 그래도 부족하면 지역 제한 없는 전체 조회. 각 단계는 실제 필요한 개수(minRequired, 호출부의
// 최종 limit)를 채우면 즉시 반환해 불필요한 다음 단계 조회를 하지 않는다. buildQuery(token)은
// token이 있으면 그 토큰으로 SQL에서 ILIKE 필터링해 조회하고, null이면 지역 제한 없이 조회한다
// (정렬·개별 .limit()은 호출부가 buildQuery 안에 이미 포함해 둔다) — 여러 번 호출될 수 있으므로
// 매번 새 쿼리 체인을 반환해야 한다.
async function fetchRegionFirstRows<T extends { id: string }>(
  buildQuery: (token: string | null) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  region: HomeRegion,
  minRequired: number
): Promise<T[]> {
  if (!region.sigunguName) {
    const all = await buildQuery(null);
    if (all.error) throw new Error(all.error.message);
    return all.data ?? [];
  }

  const { specific, broad } = tokensOf(region.sigunguName);

  const specificResult = await buildQuery(specific);
  if (specificResult.error) throw new Error(specificResult.error.message);
  let rows = specificResult.data ?? [];
  if (rows.length >= minRequired) return rows;

  if (broad) {
    const broadResult = await buildQuery(broad);
    if (broadResult.error) throw new Error(broadResult.error.message);
    const seenIds = new Set(rows.map((row) => row.id));
    rows = [...rows, ...(broadResult.data ?? []).filter((row) => !seenIds.has(row.id))];
    if (rows.length >= minRequired) return rows;
  }

  const openResult = await buildQuery(null);
  if (openResult.error) throw new Error(openResult.error.message);
  const seenIds = new Set(rows.map((row) => row.id));
  const others = (openResult.data ?? []).filter((row) => !seenIds.has(row.id));

  return [...rows, ...others];
}

// Task 9-1-9: "이번 주 시작 예정" 범위 계산 — 한국 주간(일~토) 관례로 오늘부터 이번 주 토요일까지.
function endOfThisWeek(reference: Date): string {
  const day = reference.getDay(); // 0=일 ... 6=토
  const end = new Date(reference);
  end.setDate(reference.getDate() + (6 - day));
  return end.toISOString().slice(0, 10);
}

// Task 9-1-9: 당일 진행 이벤트가 부족할 때(HERO_MIN_COUNT 미만) 채우는 "이번 주 시작 예정
// 마감임박" 행사. 당일 이벤트와 달리 정렬 기준이 "거리"가 아니라 "마감임박"(예약 마감이 가장
// 가까운 순, 없으면 시작일이 가장 가까운 순)이다 — reservation_end_date 오름차순으로 DB에서
// 이미 그 순서로 가져오므로, selectRegionFirst가 지역만 우선시키고 이 순서는 그대로 보존한다
// (거리 재정렬은 하지 않음 — 이 콘텐츠의 우선순위는 "곧 마감"이지 "가까움"이 아니기 때문).
async function getUpcomingDeadlineFill(
  count: number,
  region: HomeRegion,
  excludeIds: Set<string>
): Promise<NearbyItem[]> {
  if (count <= 0) return [];

  const supabase = await createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekEnd = endOfThisWeek(now);
  const nowIso = now.toISOString();

  const buildQuery = (token: string | null) => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .gt('start_date', today)
      .lte('start_date', weekEnd)
      .eq('is_active', true)
      .or(`is_reservation_required.eq.false,reservation_end_date.gte.${nowIso},reservation_end_date.is.null`);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query
      .order('reservation_end_date', { ascending: true, nullsFirst: false })
      .order('start_date', { ascending: true })
      .limit(200);
  };

  const data = await fetchRegionFirstRows<EventRow>(buildQuery, region, count);

  const items = dedupeAndMergeFree(data.map(toEventItem)).filter((item) => !excludeIds.has(item.id));
  return selectRegionFirst(items, region, count);
}

// docs/spec.md 2.2 ①: "당일 진행 중인 행사/이벤트 중 추천 5~10개 동적 페칭"
// docs/spec.md 1: "사전 예약 마감건은 제외하고, 오늘/주말 당일 즉시 방문 가능한 정보를 우선 추천"
// Task 9-1-6: Hero Carousel은 Strict Location-First — 선택 지역 당일 이벤트로 limit이 충족되면
// 다른 지역 이벤트는 완전히 배제한다(부족할 때만 다른 지역으로 최소 보충).
// Task 9-1-9: 당일 진행 이벤트를 1차로 전량 추출해 가까운 순으로 채우되, 그마저도 HERO_MIN_COUNT
// (10개)에 못 미치면 "이번 주 시작 예정 마감임박" 행사로 나머지를 채운다.
const HERO_MIN_COUNT = 10;

export async function getTodayEvents(
  limit = 10,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const buildQuery = (token: string | null) => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .lte('start_date', today)
      .gte('end_date', today)
      .eq('is_active', true)
      // 예약 필수이면서 이미 마감된 건은 DB 단에서 제외(마감 안 지난 것 OR 예약 불필요)
      .or(`is_reservation_required.eq.false,reservation_end_date.gte.${nowIso},reservation_end_date.is.null`);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('start_date', { ascending: false }).limit(500);
  };

  const data = await fetchRegionFirstRows<EventRow>(buildQuery, region, limit);

  const items = dedupeAndMergeFree(data.map(toEventItem));
  const ordered = sortByDistanceIfKnown(items, region);
  const primary = selectRegionFirst(ordered, region, limit);

  const minTarget = Math.min(HERO_MIN_COUNT, limit);
  if (primary.length >= minTarget) return primary;

  const excludeIds = new Set(primary.map((item) => item.id));
  const fill = await getUpcomingDeadlineFill(minTarget - primary.length, region, excludeIds);
  return [...primary, ...fill];
}

// Task 9-5-1(2026-08-22): source_type을 추가했다 — 목적별 테마 스팟 분류(src/lib/theme-spots.ts)에
// 쓰인다(events 테이블에는 이 컬럼 자체가 없어 EVENT_COLUMNS에는 추가하지 않음, 실측 확인).
const SPACE_COLUMNS =
  'id, name, category, address, location, is_free, operating_hours, info_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, sigungu_name, source_type';

type SpaceRow = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  location: unknown;
  is_free: boolean | null;
  operating_hours: string | null;
  info_url: string | null;
  is_kids_friendly: boolean | null;
  has_parking: boolean | null;
  stroller_accessible: boolean | null;
  facility_type: string | null;
  target_age_group: string | null;
  sigungu_name: string | null;
  source_type: string | null;
};

function toSpaceItem(row: SpaceRow): NearbyItem {
  const { lng, lat } = extractCoords(row.location);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    distance_meters: -1,
    item_type: 'SPACE' as const,
    lng,
    lat,
    address: row.address,
    sigungu_name: row.sigungu_name,
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: row.operating_hours,
    is_free: row.is_free,
    info_url: row.info_url,
    is_kids_friendly: row.is_kids_friendly,
    has_parking: row.has_parking,
    stroller_accessible: row.stroller_accessible,
    facility_type: row.facility_type,
    target_age_group: row.target_age_group,
    booking_status: null,
    source_type: row.source_type,
  };
}

// docs/spec.md 2.2 ③: "🎁 0원의 행복 — 지출 부담 없는 완전 무료 공공장소/행사 카드"
export async function getFreeFeed(
  limit = 12,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();

  const buildSpacesQuery = (token: string | null) => {
    let query = supabase.from('open_spaces').select(SPACE_COLUMNS).eq('is_free', true);
    if (token) query = query.or(regionOrFilter(token, 'address'));
    return query.order('created_at', { ascending: false }).limit(500);
  };

  const buildEventsQuery = (token: string | null) => {
    let query = supabase.from('events').select(EVENT_COLUMNS).eq('is_free', true).eq('is_active', true);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('start_date', { ascending: false }).limit(500);
  };

  const [spaceRows, eventRows] = await Promise.all([
    fetchRegionFirstRows<SpaceRow>(buildSpacesQuery, region, limit),
    fetchRegionFirstRows<EventRow>(buildEventsQuery, region, limit),
  ]);

  const merged = dedupeAndMergeFree([...spaceRows.map(toSpaceItem), ...eventRows.map(toEventItem)]);
  const ordered = sortByDistanceIfKnown(merged, region);
  return ordered.sort(byRegionPriority(region)).slice(0, limit);
}

// Task 9-5-1: 목적별 테마 스팟(🏊 물놀이·수영장 등) 통합 큐레이션 — 상시 공간(open_spaces)과
// "현재 개장 중인"(오늘이 진행 기간에 포함된) 시즌 행사(events, 예: 여름 탄천 물놀이장)를 함께
// 묶어 피딩한다.
// 실측에서 발견한 성능 문제(위 confidentSourceTypesFor/AMBIGUOUS_SPACE_SOURCE_TYPES 주석 참고):
// open_spaces는 "source_type IN 확정 소스" 쿼리와 "혼합 소스 한정 키워드 ILIKE" 쿼리를
// 분리해 각각 인덱스를 태운다(하나로 합치면 옵티마이저가 인덱스를 못 써 4초+ 순차 스캔,
// 지역 필터까지 더하면 타임아웃 — 실측 확인). 지역 우선순위는 SQL 필터가 아니라(같은 이유로
// 성능 문제 재발 방지) 이미 로드된 결과에 byRegionPriority로 정렬만 적용한다(제외하지 않음).
export async function getThemeSpotFeed(
  theme: ThemeSpotKey,
  limit = 20,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const confidentSourceTypes = confidentSourceTypesFor(theme);
  const spaceKeywordFilter = buildThemeKeywordFilter(theme, 'address');
  const eventKeywordFilter = buildThemeKeywordFilter(theme, 'venue_name');

  const spaceQueries: PromiseLike<{ data: SpaceRow[] | null; error: { message: string } | null }>[] = [];
  if (confidentSourceTypes.length > 0) {
    // Task 9-5-1 실측에서 추가로 발견한 문제: LOCALDATA_PLAYGROUND처럼 매칭 건수가 매우 큰
    // (전체의 60%가 넘는) source_type은, source_type+created_at 복합 인덱스가 있어도 PostgREST
    // 연결(anon 롤, 커넥션 풀러의 일반화된 실행 계획)에서는 `ORDER BY created_at DESC LIMIT 500`
    // 조합이 여전히 타임아웃을 일으켰다(관리 API로 직접 돌린 EXPLAIN ANALYZE는 빨랐지만 실제
    // PostgREST 경로에서는 재현됨 — raw SQL 결과만 믿지 않고 실제 API 엔드포인트로 재검증함).
    // ORDER BY를 빼고(어차피 최종 노출 순서는 이후 byRegionPriority가 다시 정렬함) limit도
    // 100으로 낮추니 안정적으로 빨라졌다(실측: 82,373건 소스에서 250~500ms).
    spaceQueries.push(
      supabase.from('open_spaces').select(SPACE_COLUMNS).in('source_type', confidentSourceTypes).limit(100)
    );
  }
  if (spaceKeywordFilter) {
    spaceQueries.push(
      supabase
        .from('open_spaces')
        .select(SPACE_COLUMNS)
        .in('source_type', AMBIGUOUS_SPACE_SOURCE_TYPES)
        .or(spaceKeywordFilter)
        .order('created_at', { ascending: false })
        .limit(500)
    );
  }

  const eventQuery = supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('is_active', true)
    .lte('start_date', today)
    .gte('end_date', today)
    .or(eventKeywordFilter)
    .order('start_date', { ascending: false })
    .limit(500);

  const [spaceResults, eventResult] = await Promise.all([Promise.all(spaceQueries), eventQuery]);

  for (const result of spaceResults) {
    if (result.error) throw new Error(result.error.message);
  }
  if (eventResult.error) throw new Error(eventResult.error.message);

  const seenSpaceIds = new Set<string>();
  const spaceRows: SpaceRow[] = [];
  for (const result of spaceResults) {
    for (const row of result.data ?? []) {
      if (!seenSpaceIds.has(row.id)) {
        seenSpaceIds.add(row.id);
        spaceRows.push(row);
      }
    }
  }

  const merged = dedupeAndMergeFree([...spaceRows.map(toSpaceItem), ...(eventResult.data ?? []).map(toEventItem)]);
  const ordered = sortByDistanceIfKnown(merged, region);
  return ordered.sort(byRegionPriority(region)).slice(0, limit);
}

export type HomeFeed = {
  heroEvents: NearbyItem[];
  freeFeed: NearbyItem[];
};

// 사용자 피드백(2026-08-22): 메인 Hero Carousel은 처음엔 10개만 보여주되(HomeView가 화면에
// 실제로 노출하는 개수), 같은 조건(Strict Location-First)으로 더 있는 항목을 "+더보기"로
// 마저 볼 수 있어야 한다. 그러려면 서버가 애초에 10개보다 더 많이 내려줘야 하므로, 여기서는
// 넉넉히(HERO_FETCH_LIMIT) 가져오고 실제 몇 개까지 보여줄지는 화면(HomeView)이 결정한다.
// Task 9-3-1(2026-08-22): 페이지(Server Component)가 초기 진입 시 Hero만 단독으로 페칭할 때도
// 같은 값을 쓰도록 export한다(하단 "가성비 행복" 피드는 더 이상 초기 페칭에 포함하지 않음).
export const HERO_FETCH_LIMIT = 30;

export async function getHomeFeed(region: HomeRegion = DEFAULT_HOME_REGION): Promise<HomeFeed> {
  const [heroEvents, freeFeed] = await Promise.all([
    getTodayEvents(HERO_FETCH_LIMIT, region),
    getFreeFeed(12, region),
  ]);
  return { heroEvents, freeFeed };
}
