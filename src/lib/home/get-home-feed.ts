import { createClient } from '@/lib/supabase/server';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import { GYEONGGI_SIGUN_NAMES, resolveProvinceMembers, SEOUL_GU_NAMES } from '@/lib/geo/region-hierarchy';
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

// Task 9-6-6(2026-08-23): provinceMembers가 있으면(예: /events/today 전용 지역 계층 피딩)
// fetchRegionFirstRows의 마지막(3순위) 조회 단계가 "지역 제한 없는 전체 조회"가 아니라 이
// 목록에 속한 시/군(구)로만 제한된 조회로 바뀐다 — 선택 지역과 무관한 타 지자체(예: 서울 서초구)
// 데이터가 완전히 차단된다. 기존 호출부(Hero Carousel 등)는 이 필드를 넘기지 않아 undefined로
// 남으므로 기존의 "부족하면 전체 지역으로 폴백"(피드가 텅 비지 않도록) 동작이 그대로 유지된다.
export type HomeRegion = {
  sigunguName: string | null;
  lat?: number;
  lng?: number;
  provinceMembers?: readonly string[];
};

// Task 9-1-1에서 정한 기본값(성남시 분당구 — 실제 지오코딩된 자사 DB 좌표 기준)의 지역명을
// 그대로 계승한다(추측 없음). 위치 미설정 상태를 나타내므로 lat/lng는 일부러 넣지 않는다.
export const DEFAULT_HOME_REGION: HomeRegion = { sigunguName: '성남시 분당구' };

// docs/spec.md 1: "이벤트픽 화면 노출 3대 기본 전제 조건" 중 나머지 2개(활성화 상태 `is_active=true`는
// 각 쿼리가 이미 개별로 건다) — 타겟 연령대와 중분류 유효성(NULL 아님)을 이벤트픽 화면에
// 노출되는 모든 events 쿼리에 공통 적용한다. open_spaces(스팟픽)는 이 조건의 대상이 아니다
// (Decision 010 — 스팟픽은 상시 공간 전용, 이벤트픽과 데이터 성격이 다름).
// [타겟 연령 4종 제한](2026-08-27) 사용자 지시: 기존에는 ALL(제한없음)까지 5종을 노출했으나,
// 이벤트픽은 유아/어린이/가족 대상 콘텐츠 전용으로 좁혀 INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY
// 4종만 노출한다(ALL/TEEN/YOUTH/ADULT/SENIOR/FACILITY/OTHER 전부 제외). 실측 확인
// (2026-08-27): is_active=true 3,463건 중 노출 대상이 1,947건(5종 허용)→939건(4종만
// 허용)으로 줄어든다 — 데이터 자체는 그대로 두고 노출 필터만 좁힌 것이다.
const EVENT_PICK_TARGET_AUDIENCES = ['INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY'] as const;

// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 3번 및
// 후속 확장 지시: 나들이/여가 목적과 무관한 중분류는 데이터 수집·표준 분류 자체는 그대로
// 유지하되, 홈 피드/이벤트픽/전체 탭 등 사용자에게 노출되는 모든 메인 쿼리에서 강제 배제한다.
// 최초 4종(단체봉사/청년정보/정보통신/전문·자격증)에 이어, 시설 대관류(강당/강의실/골프장/
// 다목적실/녹화장소/청년공간/회의실/주민공유공간)와 의료·행정 시설류(보건소/장애인버스/
// 서북병원/어린이병원)를 추가해 16종으로 확장했다. 실측 확인(2026-08-27): is_active=true
// 3,463건 중 이 16개 값이 409건 존재한다(강의실 57/회의실 50/주민공유공간 47/녹화장소 48/
// 다목적실 56/청년공간 43/청년정보 29/강당 38/골프장 11/장애인버스 8/서북병원 8/정보통신 6/
// 전문·자격증 3/어린이병원 3/단체봉사 1/보건소 1).
const EXCLUDED_CATEGORY_MIN = [
  '강당', '강의실', '골프장', '다목적실', '녹화장소', '단체봉사', '보건소', '장애인버스',
  '서북병원', '어린이병원', '청년공간', '전문/자격증', '청년정보', '회의실', '정보통신', '주민공유공간',
] as const;
const EXCLUDED_CATEGORY_MIN_FILTER = `(${EXCLUDED_CATEGORY_MIN.map((v) => `"${v}"`).join(',')})`;

function extractCoords(location: unknown): { lng: number; lat: number } {
  const geometry = location as { coordinates: [number, number] } | null;
  return { lng: geometry?.coordinates?.[0] ?? 0, lat: geometry?.coordinates?.[1] ?? 0 };
}

// [카드 표준 중분류/연령대상 표시](2026-08-27 사용자 지시): category_min/target_audience를
// 카드/상세보기 표시용으로 추가 선택한다(둘 다 이벤트픽 3대 조건 필터에 이미 쓰이고 있어
// 추가 조회 비용 없이 select 목록에만 포함하면 된다).
// [상세보기 설명 추가](2026-08-27 사용자 지시): description도 함께 선택한다(제목만으로는
// 내용을 알기 어려운 행사가 많다는 지적).
const EVENT_COLUMNS =
  'id, title, description, event_type, category_min, target_audience, location, location_precision, thumbnail_url, start_date, end_date, reservation_start_date, reservation_end_date, reservation_url, is_reservation_required, is_free, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, booking_status, venue_name, sigungu_name';

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  category_min: string | null;
  target_audience: string | null;
  location: unknown;
  location_precision: string | null;
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
    category_min: row.category_min,
    target_audience: row.target_audience,
    description: row.description,
    // Task 9-1-3: 더 이상 거리를 계산하지 않는다 — -1 sentinel(기존 컴포넌트들이 이미
    // "거리 정보 없음"으로 처리하는 관례값)을 그대로 쓴다.
    distance_meters: -1,
    item_type: 'EVENT',
    lng,
    lat,
    // Task 9-6-2(2026-08-23, Decision 009): location_precision이 'EXACT'가 아니면(근사/미상)
    // DetailModal이 지도/길찾기 UI를 숨긴다 — 정확한 위치가 아닌데 지도에 정확한 핀처럼
    // 보이면 사용자를 오도하므로. open_spaces는 이 컬럼이 아예 없어(항상 정확한 주소) toSpaceItem이
    // 이 필드를 채우지 않고, NearbyItem 타입에서 undefined이면 EXACT로 간주하도록 소비 측이 처리한다.
    location_precision: row.location_precision as NearbyItem['location_precision'],
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
// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "Hero 카드 구역"): 호출부가 tierFn을
// 넘기면 그 기준으로 순위를 매긴다(기본값은 기존 regionTier 그대로 — 다른 호출부의 동작은
// 변경 없음). getTodayEvents만 heroRegionTier를 넘겨 "그 외 수도권" 안에서도 경기/서울 우선순위를
// 추가로 가른다.
function selectRegionFirst(
  items: NearbyItem[],
  region: HomeRegion,
  limit: number,
  tierFn: (item: NearbyItem, region: HomeRegion) => number = regionTier
): NearbyItem[] {
  if (!region.sigunguName) return items.slice(0, limit);

  const ranked = [...items].sort((a, b) => tierFn(a, region) - tierFn(b, region));
  return ranked.slice(0, limit);
}

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "Hero 카드 구역"): "사용자 위치가
// 경기도인 경우 경기도→서울시 순, 서울시인 경우 서울시→경기도 순" 정렬 요구사항. regionTier의
// 2순위("그 외")는 이미 항상 수도권(경기+서울)으로만 좁혀져 있다(fetchRegionFirstRows 3단계가
// resolveProvinceMembers로 CAPITAL_AREA_MEMBERS까지만 조회하기 때문) — 그 안에서 사용자 자신의
// 도(경기/서울)에 속한 항목을 한 번 더 앞으로 당긴다. 0/1순위(정확 일치/상위 시 일치)는 기존과
// 동일하게 최우선 유지한다(이 요구사항은 그 다음 단계에만 적용).
function provinceOf(text: string | null | undefined): 'GYEONGGI' | 'SEOUL' | null {
  if (!text) return null;
  if (GYEONGGI_SIGUN_NAMES.some((name) => text.includes(name))) return 'GYEONGGI';
  if (SEOUL_GU_NAMES.some((name) => text.includes(name))) return 'SEOUL';
  return null;
}

function heroRegionTier(item: NearbyItem, region: HomeRegion): 0 | 1 | 2 | 3 {
  const baseTier = regionTier(item, region);
  if (baseTier < 2) return baseTier;

  const userProvince = provinceOf(region.sigunguName);
  if (!userProvince) return 2;

  const itemProvince = provinceOf(item.sigungu_name) ?? provinceOf(item.address);
  if (!itemProvince) return 3;

  return itemProvince === userProvince ? 2 : 3;
}

// Task 9-4-4: sigungu_name과 주소 텍스트(events는 venue_name, open_spaces는 address) 양쪽에
// ILIKE 부분 문자열 매칭을 거는 OR 필터 문자열을 만든다(PostgREST `.or()` 문법).
// 방어적으로 한 번 더 sanitizeRegionToken을 거친다(이 함수를 다른 경로에서 sanitize 없이
// 직접 호출하더라도 필터 문자열이 깨지지 않도록).
// Task 9-6-6: token이 배열이면(provinceMembers 등 여러 시/군 목록) 각 이름마다 조건을 만들어
// 전부 이어붙인다 — "이 목록에 속한 지역 중 하나라도 매칭되면 포함"이라는 의미의 OR 확장.
function regionOrFilter(tokenOrTokens: string | readonly string[], textColumn: string): string {
  const tokens = Array.isArray(tokenOrTokens) ? tokenOrTokens : [tokenOrTokens];
  return tokens
    .map(sanitizeRegionToken)
    .filter(Boolean)
    .map((safeToken) => `sigungu_name.ilike.%${safeToken}%,${textColumn}.ilike.%${safeToken}%`)
    .join(',');
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
  buildQuery: (
    token: string | readonly string[] | null
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
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

  // Task 9-6-6: provinceMembers가 있으면 마지막 단계도 그 목록(예: 경기도 31개 시/군)으로만
  // 제한된 조회로 바꾼다.
  // Task 9-6-7(2026-08-23): provinceMembers를 명시적으로 넘기지 않은 호출부(Hero Carousel의
  // DEFAULT_HOME_REGION, 가성비 행복 섹션 등)에서 "성남시 분당구" 같은 sigunguName만으로도
  // 소속 도/특별시를 자동 판별해 같은 차단을 적용한다 — 호출부가 provinceMembers를 넘기는 걸
  // 잊어도(실제로 이 버그의 원인이었다) 안전하게 타 지자체가 차단된다. 인식 불가능한 지역이면
  // resolveProvinceMembers가 undefined를 반환해 기존처럼 지역 제한 없는 폴백을 유지한다.
  const provinceMembers =
    region.provinceMembers && region.provinceMembers.length > 0
      ? region.provinceMembers
      : resolveProvinceMembers(region.sigunguName);
  const finalToken = provinceMembers ?? null;
  const openResult = await buildQuery(finalToken);
  if (openResult.error) throw new Error(openResult.error.message);
  const seenIds = new Set(rows.map((row) => row.id));
  const others = (openResult.data ?? []).filter((row) => !seenIds.has(row.id));

  return [...rows, ...others];
}

// docs/spec.md 2.2 ①: "당일 진행 중인 행사/이벤트 중 추천 5~10개 동적 페칭"
// docs/spec.md 1: "사전 예약 마감건은 제외하고, 오늘/주말 당일 즉시 방문 가능한 정보를 우선 추천"
// Task 9-1-6: Hero Carousel은 Strict Location-First — 선택 지역 당일 이벤트로 limit이 충족되면
// 다른 지역 이벤트는 완전히 배제한다.
// Task 9-6-9(2026-08-23): 사용자 피드백 — "당일 진행 중"(start_date<=오늘<=end_date, 몇 주짜리
// 장기 전시도 매일 노출됨)이 아니라 "당일 한정"(end_date=오늘, 오늘이 사실상 마지막 날이거나
// 하루짜리 행사)만 노출해야 "오늘의 추천"이라는 이름에 맞는 실제 긴급성이 생긴다. 또한 Task
// 9-1-9에서 도입한 "이번 주 시작 예정 마감임박으로 최소 10개 채우기"(HERO_MIN_COUNT/
// getUpcomingDeadlineFill)를 완전히 제거한다 — 조건에 맞는 당일 한정 행사가 0건이면 섹션
// 자체를 숨기고(home-view.tsx), N건이면 N개만 그대로 보여준다(10개로 억지로 채우지 않음).
export async function getTodayEvents(
  limit = 10,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const buildQuery = (token: string | readonly string[] | null) => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('end_date', today)
      .eq('is_active', true)
      .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
      .not('category_min', 'is', null)
      .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
      // 예약 필수이면서 이미 마감된 건은 DB 단에서 제외(마감 안 지난 것 OR 예약 불필요)
      .or(`is_reservation_required.eq.false,reservation_end_date.gte.${nowIso},reservation_end_date.is.null`);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('start_date', { ascending: false }).limit(500);
  };

  const data = await fetchRegionFirstRows<EventRow>(buildQuery, region, limit);

  const items = dedupeAndMergeFree(data.map(toEventItem));
  const ordered = sortByDistanceIfKnown(items, region);
  return selectRegionFirst(ordered, region, limit, heroRegionTier);
}

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "당일 예약 필요 카드 구역"): "당일
// 기준 현재 예약 접수가 가능한(SVCSTATNM == '접수중') 이벤트/행사/클래스" 가로 스크롤 슬라이더.
// booking_status 컬럼은 deriveBookingStatus()(ai-tagging.mjs)가 원문 그대로 '접수중' 문자열을
// 쓰므로 SEOUL_CULTURE_EVENTS/TOUR_API_FESTIVAL/GG_CULTURE_EVENTS 3개 소스는 이 컬럼만 봐도
// 된다. 다만 SEOUL_YEYAK(source='seoul_public_reservation')은 이 컬럼을 채우지 않고 대신
// is_active를 원본 SVCSTATNM 기반으로만 세팅한다(seoul-yeyak-adapter.mjs 실측 확인) — 이
// 소스에서 "접수중" 상태를 판별하려면 raw_data JSONB에 보존된 원본 SVCSTATNM을 직접 비교해야
// 한다(admin-data-grid RPC가 이미 raw_data->>'SVCSTATNM'으로 같은 값을 추출해 쓰는 것과 동일한
// 방식 — scripts/migrations/2026-08-25-admin-data-grid-rpcs.sql 참고). 두 조건을 각각 별도
// 쿼리로 걸어 병합·중복 제거한다(하나의 필터로 합치면 PostgREST에서 컬럼명에 '->>'가 섞인
// 조건과 일반 컬럼 조건을 안전하게 하나의 or() 문자열로 결합하기 까다롭다).
export async function getReservationOpenEvents(
  limit = 10,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const buildBookingStatusOpenQuery = (token: string | readonly string[] | null) => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('booking_status', '접수중')
      .eq('is_active', true)
      .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
      .not('category_min', 'is', null)
      .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
      .gte('end_date', today);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('start_date', { ascending: false }).limit(500);
  };

  const buildSeoulYeyakOpenQuery = (token: string | readonly string[] | null) => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('source', 'seoul_public_reservation')
      .eq('raw_data->>SVCSTATNM', '접수중')
      .eq('is_active', true)
      .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
      .not('category_min', 'is', null)
      .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
      .gte('end_date', today);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('start_date', { ascending: false }).limit(500);
  };

  const buildQuery = async (token: string | readonly string[] | null) => {
    const [statusResult, yeyakResult] = await Promise.all([
      buildBookingStatusOpenQuery(token),
      buildSeoulYeyakOpenQuery(token),
    ]);
    if (statusResult.error) return statusResult;
    if (yeyakResult.error) return yeyakResult;

    const seenIds = new Set<string>();
    const merged: EventRow[] = [];
    for (const row of [...(statusResult.data ?? []), ...(yeyakResult.data ?? [])]) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        merged.push(row);
      }
    }
    return { data: merged, error: null };
  };

  const data = await fetchRegionFirstRows<EventRow>(buildQuery, region, limit);

  const items = dedupeAndMergeFree(data.map(toEventItem));
  const ordered = sortByDistanceIfKnown(items, region);
  const regionOrdered = ordered.sort(byRegionPriority(region));
  return sortByCategoryMinPriority(regionOrdered, limit).slice(0, limit);
}

// [카드 순서 우선순위](2026-08-27 사용자 지시): "현재 이용 가능"/"예약 가능" 두 섹션에서
// 공공키즈카페류(유아/어린이 특화)는 좀 더 앞으로, 자연/과학·교육체험(상대적으로 덜 특화된
// 일반 프로그램)은 뒤로 가면 좋겠다는 지적. 이 두 섹션에만 적용하는 부드러운 우선순위
// 정렬이다 — 지시받지 않은 나머지 카테고리는 전부 동일한 중간 순위로 그대로 둔다(추측으로
// 전체 카테고리 순위를 매기지 않는다, 제3장 제5조).
//
// [카드 순서 우선순위 — 쏠림 수정](2026-08-27 후속 버그 수정): 처음 구현(전체를 우선순위로
// 정렬 후 limit만큼 자르기)은 "부드러운 정렬"이 아니었다 — 공공키즈카페류 공급이 넉넉하면
// (실측 확인: is_active=true만 265건) limit(20) 전체를 공공키즈카페류가 독점해 다른 카테고리가
// 한 건도 안 보이는 상태가 됐다(실제 재현: "현재 이용 가능"/"예약 가능"이 전부 공공키즈카페로만
// 채워짐). "앞으로 가면 좋겠다"는 지시는 "그것만 보이게 해달라"는 뜻이 아니므로, 앞 우선순위가
// 차지할 수 있는 자리를 전체의 절반으로 제한(FRONT_TIER_MAX_SHARE)해 나머지 절반은 반드시
// 중간/뒤 우선순위 카테고리로 채워지도록 한다. 잘려나간 앞 우선순위 항목은 완전히 버리지
// 않고 중간 우선순위 뒤·뒤 우선순위 앞에 이어붙여, limit 안에 못 들어가면 자연스럽게
// 잘려나가되 여전히 뒤 우선순위보다는 앞서도록 한다.
const CATEGORY_MIN_PRIORITY_FRONT = new Set(['공공키즈카페', '어린이실내놀이터']);
const CATEGORY_MIN_PRIORITY_BACK = new Set(['자연/과학', '교육체험']);
const FRONT_TIER_MAX_SHARE = 0.5;

function categoryMinPriorityTier(categoryMin: string | null | undefined): 0 | 1 | 2 {
  if (categoryMin && CATEGORY_MIN_PRIORITY_FRONT.has(categoryMin)) return 0;
  if (categoryMin && CATEGORY_MIN_PRIORITY_BACK.has(categoryMin)) return 2;
  return 1;
}

// 지역/거리 정렬이 끝난 배열에 마지막으로 적용한다. limit을 함께 받아, 앞 우선순위 항목이
// 전체 노출 자리의 절반을 넘게 차지하지 못하도록 상한을 둔다(각 그룹 내부의 상대 순서는
// 원래의 지역/거리 정렬 순서를 그대로 유지한다).
function sortByCategoryMinPriority(items: NearbyItem[], limit: number): NearbyItem[] {
  const front: NearbyItem[] = [];
  const middle: NearbyItem[] = [];
  const back: NearbyItem[] = [];
  for (const item of items) {
    const tier = categoryMinPriorityTier(item.category_min);
    if (tier === 0) front.push(item);
    else if (tier === 2) back.push(item);
    else middle.push(item);
  }

  const frontCap = Math.max(1, Math.ceil(limit * FRONT_TIER_MAX_SHARE));
  const frontShown = front.slice(0, frontCap);
  const frontOverflow = front.slice(frontCap);
  return [...frontShown, ...middle, ...frontOverflow, ...back];
}

// [이벤트픽 화면 개편] "현재 이용 가능" 카드 구역(2026-08-27 사용자 지시): "예약 가능"
// (getReservationOpenEvents, 예약 접수 상태 기준) 바로 위에 두는 별도 섹션 — 예약 여부와
// 무관하게 오늘 날짜가 행사 진행 기간(start_date~end_date) 안에 있으면(지금 당장 가서 볼 수
// 있는 행사) 노출한다. getReservationOpenEvents처럼 소스별 분기가 필요 없다(start_date/
// end_date는 모든 소스가 공통으로 채우는 컬럼) — 단일 쿼리로 충분하다.
export async function getCurrentlyOngoingEvents(
  limit = 10,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const buildQuery = (token: string | readonly string[] | null) => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('is_active', true)
      .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
      .not('category_min', 'is', null)
      .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
      .lte('start_date', today)
      .gte('end_date', today);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('start_date', { ascending: false }).limit(500);
  };

  const data = await fetchRegionFirstRows<EventRow>(buildQuery, region, limit);

  const items = dedupeAndMergeFree(data.map(toEventItem));
  const ordered = sortByDistanceIfKnown(items, region);
  const regionOrdered = ordered.sort(byRegionPriority(region));
  return sortByCategoryMinPriority(regionOrdered, limit).slice(0, limit);
}

// [전체보기 페이지](2026-08-27 사용자 지시): 홈 미리보기(getCurrentlyOngoingEvents/
// getReservationOpenEvents)는 "몇 개만 보여주고 끝"이라 전체를 확인할 방법이 없다는 지적 —
// Hero Carousel의 "오늘 전체보기"(/events/today)와 동일하게, 두 섹션에도 실제 DB 페이지네이션
// (.range())으로 전부 훑어볼 수 있는 전용 페이지를 만든다. 미리보기와 달리 지역/거리 큐레이션
// (Strict Location-First, 카드 순서 우선순위)은 적용하지 않는다 — "전부 보여달라"는 목적과
// "일부를 앞으로 당겨 보여주는" 큐레이션은 상충하므로, 여기서는 안정적인 페이지 경계를 위해
// start_date 오름차순 단일 정렬만 쓴다. 같은 이유로 제목 유사 병합(dedupeAndMergeFree)도 하지
// 않는다 — 오프셋 페이지네이션과 사후 병합을 같이 쓰면 페이지마다 건수가 들쭉날쭉해진다.
export type PagedEvents = { items: NearbyItem[]; total: number };

const BROWSE_ALL_PAGE_SIZE = 24;

export async function getCurrentlyOngoingEventsPage(page = 1, pageSize = BROWSE_ALL_PAGE_SIZE): Promise<PagedEvents> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from('events')
    .select(EVENT_COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
    .not('category_min', 'is', null)
    .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
    .lte('start_date', today)
    .gte('end_date', today)
    .order('start_date', { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);

  return { items: ((data ?? []) as EventRow[]).map(toEventItem), total: count ?? 0 };
}

export async function getReservationOpenEventsPage(page = 1, pageSize = BROWSE_ALL_PAGE_SIZE): Promise<PagedEvents> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // getReservationOpenEvents의 두 조건(booking_status='접수중' OR SEOUL_YEYAK 원본
  // SVCSTATNM='접수중')을 별도 쿼리 두 번 + 병합이 아니라 하나의 or() 그룹으로 합친다 —
  // 오프셋 페이지네이션은 "정확한 count와 안정적인 페이지 경계"가 필요한데, 두 쿼리를 따로
  // 페이지네이션한 뒤 합치면 그 두 조건을 다 만족할 수 없다(제5장 제5조 데이터 중심 —
  // count(*)가 실제 화면과 어긋나면 안 됨).
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from('events')
    .select(EVENT_COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
    .not('category_min', 'is', null)
    .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
    .gte('end_date', today)
    .or(`booking_status.eq.접수중,and(source.eq.seoul_public_reservation,raw_data->>SVCSTATNM.eq.접수중)`)
    .order('start_date', { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);

  return { items: ((data ?? []) as EventRow[]).map(toEventItem), total: count ?? 0 };
}

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "GNB 헤더 & 글로벌 위치 상태 공유"):
// 이벤트픽 검색은 events 테이블 전용으로 수행한다(스팟픽의 open_spaces 검색과 분리) — 검색은
// 사용자가 이름을 직접 아는 상태로 찾는 행위라 지역 제한을 걸지 않는다(다른 피드 함수들과
// 달리 region 파라미터 자체가 없음, 추측으로 지역 스코프를 넣지 않는다).
export async function searchEvents(keyword: string, limit = 30): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .ilike('title', `%${keyword}%`)
    .eq('is_active', true)
    .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
    .not('category_min', 'is', null)
    .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
    .gte('end_date', today)
    .order('start_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as EventRow[]).map(toEventItem);
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
// Task 9-6-4(2026-08-23): dataType 기본값 'events' — 홈 화면 최상위 대분류(🎪 행사·축제가
// 기본)에 맞춰 open_spaces는 명시적으로 'open_spaces'를 넘길 때만 조회한다.
export async function getFreeFeed(
  limit = 12,
  region: HomeRegion = DEFAULT_HOME_REGION,
  dataType: 'events' | 'open_spaces' = 'events'
): Promise<NearbyItem[]> {
  const supabase = await createClient();

  const buildSpacesQuery = (token: string | readonly string[] | null) => {
    let query = supabase.from('open_spaces').select(SPACE_COLUMNS).eq('is_free', true);
    if (token) query = query.or(regionOrFilter(token, 'address'));
    return query.order('created_at', { ascending: false }).limit(500);
  };

  const buildEventsQuery = (token: string | readonly string[] | null) => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('is_free', true)
      .eq('is_active', true)
      .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
      .not('category_min', 'is', null)
      .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('start_date', { ascending: false }).limit(500);
  };

  const [spaceRows, eventRows] = await Promise.all([
    dataType === 'open_spaces' ? fetchRegionFirstRows<SpaceRow>(buildSpacesQuery, region, limit) : Promise.resolve([]),
    dataType === 'events' ? fetchRegionFirstRows<EventRow>(buildEventsQuery, region, limit) : Promise.resolve([]),
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
// Task 9-6-4(2026-08-23): dataType 기본값 'events' — 홈 화면 대분류 토글에 맞춰 'events'면
// open_spaces 쿼리를, 'open_spaces'면 events 쿼리를 아예 건너뛴다(대분류 간 데이터가 섞이지
// 않도록). 기존 "🏞️ 목적별 추천 스팟" 섹션은 이 함수의 유일한 호출부였고 이번에 새 대분류
// UI로 대체되었으므로, 혼합 조회가 필요한 다른 호출부는 없다(그래도 하위 호환을 위해
// 파라미터를 optional로 둔다).
export async function getThemeSpotFeed(
  theme: ThemeSpotKey,
  limit = 20,
  region: HomeRegion = DEFAULT_HOME_REGION,
  dataType: 'events' | 'open_spaces' = 'events'
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const confidentSourceTypes = dataType === 'open_spaces' ? confidentSourceTypesFor(theme) : [];
  const spaceKeywordFilter = dataType === 'open_spaces' ? buildThemeKeywordFilter(theme, 'address') : '';
  const eventKeywordFilter = dataType === 'events' ? buildThemeKeywordFilter(theme, 'venue_name') : '';

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

  const eventQuery =
    dataType === 'events'
      ? supabase
          .from('events')
          .select(EVENT_COLUMNS)
          .eq('is_active', true)
          .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
          .not('category_min', 'is', null)
          .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
          .lte('start_date', today)
          .gte('end_date', today)
          .or(eventKeywordFilter)
          .order('start_date', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as EventRow[], error: null });

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

// docs/spec.md 2.2 ②(2026-08-25 개정, Task 9-6-17): "5대 카테고리 Quick 아이콘 그리드: 클릭 시
// 라우팅 이동 없이 이벤트픽 메인 화면 내부에서 해당 카테고리 카드 피드로 즉시 전환(인라인 피딩)".
// 이벤트픽(HomeView)은 항상 events만 다루므로(Task 9-6-10) dataType 분기 없이 events 테이블만
// event_type(=5대 UI 카테고리 값)으로 필터링한다. "현재 진행 중"(오늘이 start~end 기간에 포함)
// 조건은 getThemeSpotFeed의 events 조회와 동일하게 맞춘다.
// [대분류/중분류 드릴다운 개편](2026-08-27 사용자 지시): 기존 event_type 기반 필터를
// category_min(표준 중분류) 기반으로 교체했다 — 홈 화면 카테고리 Quick 그리드가 이제
// 대분류(category_maj) → 중분류(category_min) 2단계 드릴다운이라, 최종 카드 조회는 사용자가
// 실제로 선택한 중분류 값 그대로 필터링해야 한다. 이 함수의 유일한 소비처
// (/api/home/category-feed)도 함께 바꿨다 — 다른 호출부는 없다(실측 확인).
export async function getCategoryMinFeed(
  categoryMin: string,
  limit = 20,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const buildQuery = (token: string | readonly string[] | null) => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('category_min', categoryMin)
      .eq('is_active', true)
      .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
      .not('category_min', 'is', null)
      .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
      .lte('start_date', today)
      .gte('end_date', today);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('start_date', { ascending: false }).limit(500);
  };

  const data = await fetchRegionFirstRows<EventRow>(buildQuery, region, limit);

  const items = dedupeAndMergeFree(data.map(toEventItem));
  const ordered = sortByDistanceIfKnown(items, region);
  return selectRegionFirst(ordered, region, limit);
}

export type HomeFeed = {
  heroEvents: NearbyItem[];
  freeFeed: NearbyItem[];
  reservationOpenEvents: NearbyItem[];
  currentlyOngoingEvents: NearbyItem[];
};

// 사용자 피드백(2026-08-22): 메인 Hero Carousel은 처음엔 10개만 보여주되(HomeView가 화면에
// 실제로 노출하는 개수), 같은 조건(Strict Location-First)으로 더 있는 항목을 "+더보기"로
// 마저 볼 수 있어야 한다. 그러려면 서버가 애초에 10개보다 더 많이 내려줘야 하므로, 여기서는
// 넉넉히(HERO_FETCH_LIMIT) 가져오고 실제 몇 개까지 보여줄지는 화면(HomeView)이 결정한다.
// Task 9-3-1(2026-08-22): 페이지(Server Component)가 초기 진입 시 Hero만 단독으로 페칭할 때도
// 같은 값을 쓰도록 export한다(하단 "가성비 행복" 피드는 더 이상 초기 페칭에 포함하지 않음).
export const HERO_FETCH_LIMIT = 30;

// [프론트엔드 UI/UX 개선](2026-08-26): "예약 가능 카드" 가로 스크롤 슬라이더도 Hero처럼
// 화면에 보여줄 개수(HomeView가 결정)보다 넉넉히 가져온다.
export const RESERVATION_OPEN_FETCH_LIMIT = 20;

// [이벤트픽 화면 개편](2026-08-27): "현재 이용 가능" 슬라이더도 동일한 관례.
export const CURRENTLY_ONGOING_FETCH_LIMIT = 20;

export async function getHomeFeed(region: HomeRegion = DEFAULT_HOME_REGION): Promise<HomeFeed> {
  const [heroEvents, freeFeed, reservationOpenEvents, currentlyOngoingEvents] = await Promise.all([
    getTodayEvents(HERO_FETCH_LIMIT, region),
    getFreeFeed(12, region),
    getReservationOpenEvents(RESERVATION_OPEN_FETCH_LIMIT, region),
    getCurrentlyOngoingEvents(CURRENTLY_ONGOING_FETCH_LIMIT, region),
  ]);
  return { heroEvents, freeFeed, reservationOpenEvents, currentlyOngoingEvents };
}
