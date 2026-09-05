import { createClient } from '@/lib/supabase/server';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import { escapeIlikePattern, splitSearchTokens } from '@/lib/search/keyword-search';
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
// [todo.md 개선사항 5](2026-09-03): 어드민 마이그레이션 폼(스팟픽→이벤트픽)에서도 "이관 직후
// 즉시 노출"을 보장하려면 이 4종 중 하나로만 target_audience를 지정해야 한다 — export해
// migrate-to-event API 라우트/모달이 그대로 재사용한다(제5장 제4조 기존 구조 우선).
export const EVENT_PICK_TARGET_AUDIENCES = ['INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY'] as const;

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
// [이벤트픽 홈 슬라이드 정렬 개선](2026-08-29 사용자 지시): selectRegionFirst가 하던 "지역
// 우선순위로 정렬"과 "limit만큼 자르기"를 분리했다 — getTodayEvents가 자르기 전에
// interleaveByCategoryMin(카테고리 교차배치)을 한 번 더 거쳐야 하기 때문. 기존 유일한
// 호출부(getCategoryMinFeed)는 selectRegionFirst를 그대로 쓰므로 동작 변화가 없다.
function rankByRegion(
  items: NearbyItem[],
  region: HomeRegion,
  tierFn: (item: NearbyItem, region: HomeRegion) => number = regionTier
): NearbyItem[] {
  if (!region.sigunguName) return items;
  return [...items].sort((a, b) => tierFn(a, region) - tierFn(b, region));
}

// [중분류 데이터 로딩 속도 개선 - 페이지네이션 도입](2026-09-04 사용자 지시): 이 함수의
// 유일한 호출부(getCategoryMinFeed)가 "더보기" 다음 페이지를 요청할 수 있도록 offset을
// 추가했다 — 다른 호출부가 없어(주석 참고, selectRegionFirst는 getCategoryMinFeed
// 전용) 시그니처를 바꿔도 영향받는 다른 코드가 없다.
function selectRegionFirst(
  items: NearbyItem[],
  region: HomeRegion,
  offset: number,
  limit: number,
  tierFn: (item: NearbyItem, region: HomeRegion) => number = regionTier
): NearbyItem[] {
  return rankByRegion(items, region, tierFn).slice(offset, offset + limit);
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
// [이벤트픽 홈 슬라이드/전체보기 정렬 개선](2026-08-29 사용자 지시): 이 함수는 홈 Hero
// Carousel 미리보기(diversifyByCategory=true, 카테고리 믹스 필요)와 "오늘 전체보기" 바텀시트
// (EventBrowseSheet, diversifyByCategory 생략=false, 단순 마감임박순만 필요) 양쪽에서
// 공유된다 — 바텀시트는 전체 목록을 있는 그대로 훑어보는 화면이라 카테고리 교차배치를 적용하면
// 오히려 순서가 뒤섞여 보이므로, 새 파라미터로 명시적으로 켤 때만 interleaveByCategoryMin을
// 적용한다(기본값 false로 기존 바텀시트 호출부는 변경 없이 그대로 동작).
export async function getTodayEvents(
  limit = 10,
  region: HomeRegion = DEFAULT_HOME_REGION,
  categoryMins?: readonly string[],
  diversifyByCategory = false
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
    if (categoryMins && categoryMins.length > 0) query = query.in('category_min', categoryMins);
    if (token) query = query.or(regionOrFilter(token, 'venue_name'));
    return query.order('end_date', { ascending: true }).limit(500);
  };

  const data = await fetchRegionFirstRows<EventRow>(buildQuery, region, limit);

  const items = dedupeAndMergeFree(data.map(toEventItem));
  const distanceOrdered = sortByDistanceIfKnown(items, region);
  const dateOrdered = sortByEndDateAscending(distanceOrdered);
  const regionOrdered = rankByRegion(dateOrdered, region, heroRegionTier);
  return diversifyByCategory ? interleaveByCategoryMin(regionOrdered, limit) : regionOrdered.slice(0, limit);
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
    return query.order('end_date', { ascending: true }).limit(500);
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
    return query.order('end_date', { ascending: true }).limit(500);
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
  const distanceOrdered = sortByDistanceIfKnown(items, region);
  const dateOrdered = sortByEndDateAscending(distanceOrdered);
  const regionOrdered = dateOrdered.sort(byRegionPriority(region));
  return interleaveByCategoryMin(regionOrdered, limit);
}

// [이벤트픽 홈 슬라이드 카테고리 믹스 정렬](2026-08-29 사용자 지시): 이전에는 "공공키즈카페/
// 어린이실내놀이터는 앞으로, 자연/과학·교육체험은 뒤로"처럼 특정 카테고리 2~4개만 하드코딩해
// 봐주는 방식(sortByCategoryMinPriority, FRONT_TIER_MAX_SHARE 50% 상한)이었다. 이번 지시는
// "특정 카테고리(공공 키즈카페 등)가 슬라이드를 독점하지 않도록" 상한/교차배치를 요구하는
// 더 일반적인 요구라, 어떤 카테고리 조합이 오더라도 자동으로 골고루 섞이는 라운드로빈
// 교차배치로 완전히 대체한다(하드코딩된 카테고리 목록 없음). 카테고리별로 그룹을 나눈 뒤
// 그룹을 한 바퀴씩 돌며 한 건씩 채우므로, 어떤 카테고리도 실질적으로
// ceil(limit / 등장한 카테고리 수)를 넘게 차지할 수 없다. 각 그룹 내부 순서(호출부가 미리
// 정렬해 둔 종료일 임박순 → 거리/지역 우선순위)는 그대로 유지된다.
function interleaveByCategoryMin(items: NearbyItem[], limit: number): NearbyItem[] {
  const groups = new Map<string, NearbyItem[]>();
  for (const item of items) {
    const key = item.category_min ?? '';
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const groupArrays = [...groups.values()];
  const result: NearbyItem[] = [];
  for (let round = 0; result.length < limit; round++) {
    let addedAny = false;
    for (const group of groupArrays) {
      if (round >= group.length) continue;
      result.push(group[round]);
      addedAny = true;
      if (result.length >= limit) break;
    }
    if (!addedAny) break;
  }
  return result;
}

// [이벤트픽 홈 슬라이드 마감임박순 정렬](2026-08-29 사용자 지시): "각 카테고리 내부에서
// 종료일(end_date)이 가까운 순서로 정렬"— distance/region 우선순위 정렬보다 먼저 적용해
// 둔다. Array.prototype.sort는 안정 정렬이라, 이후 sortByDistanceIfKnown/byRegionPriority가
// 정확히 동일한 값(같은 거리·같은 지역 우선순위)을 가진 항목끼리 묶을 때는 이 종료일 순서가
// 그대로 유지된다 — 즉 최종 순위는 "지역 우선순위 > 거리 > 종료일" 순으로 결정되지만, 같은
// 지역·거리 조건이면 종료일이 임박한 것부터 보인다.
function sortByEndDateAscending(items: NearbyItem[]): NearbyItem[] {
  return [...items].sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));
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
    return query.order('end_date', { ascending: true }).limit(500);
  };

  const data = await fetchRegionFirstRows<EventRow>(buildQuery, region, limit);

  const items = dedupeAndMergeFree(data.map(toEventItem));
  const distanceOrdered = sortByDistanceIfKnown(items, region);
  const dateOrdered = sortByEndDateAscending(distanceOrdered);
  const regionOrdered = dateOrdered.sort(byRegionPriority(region));
  return interleaveByCategoryMin(regionOrdered, limit);
}

// [전체보기 페이지](2026-08-27 사용자 지시): 홈 미리보기(getCurrentlyOngoingEvents/
// getReservationOpenEvents)는 "몇 개만 보여주고 끝"이라 전체를 확인할 방법이 없다는 지적 —
// Hero Carousel의 "오늘 전체보기"(/events/today)와 동일하게, 두 섹션에도 실제 DB 페이지네이션
// (.range())으로 전부 훑어볼 수 있는 전용 페이지를 만든다. 미리보기와 달리 지역/거리 큐레이션
// (Strict Location-First, 카드 순서 우선순위)은 적용하지 않는다 — "전부 보여달라"는 목적과
// "일부를 앞으로 당겨 보여주는" 큐레이션은 상충하므로 dedupeAndMergeFree(제목 유사 병합)도 하지
// 않는다(오프셋 페이지네이션과 사후 병합을 같이 쓰면 페이지마다 건수가 들쭉날쭉해진다).
// [전체보기 마감임박순 정렬](2026-08-29 사용자 지시): 기간이 매우 긴 이벤트가 start_date
// 기준으로는 맨 앞에 고정돼 버리는 문제가 있어, 정렬 기준을 end_date 오름차순(마감임박순)으로
// 바꿨다.
export type PagedEvents = { items: NearbyItem[]; total: number };

const BROWSE_ALL_PAGE_SIZE = 24;

// [이벤트픽 전체보기 바텀시트化](2026-08-29 사용자 지시): 페이지 이동 대신 바텀시트에서
// 중분류(category_maj) 칩으로 즉시 필터링하려면, 서버가 그 칩에 해당하는 category_min
// 목록으로 좁혀 재조회해야 한다(실측 확인: 전국 기준 ongoing 1,972건/reservation-open
// 918건 — 전량을 클라이언트로 내려 필터링하기엔 너무 커서 기존 오프셋 페이지네이션 구조를
// 그대로 유지하고 필터 조건만 추가한다).
export async function getCurrentlyOngoingEventsPage(
  page = 1,
  pageSize = BROWSE_ALL_PAGE_SIZE,
  categoryMins?: readonly string[]
): Promise<PagedEvents> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const from = (page - 1) * pageSize;
  let query = supabase
    .from('events')
    .select(EVENT_COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
    .not('category_min', 'is', null)
    .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
    .lte('start_date', today)
    .gte('end_date', today);
  if (categoryMins && categoryMins.length > 0) query = query.in('category_min', categoryMins);
  // [전체보기 마감임박순 정렬](2026-08-29 사용자 지시): start_date 오름차순은 기간이 매우 긴
  // 이벤트가 맨 앞에 고정되는 문제가 있어 end_date 오름차순(마감임박순)으로 바꿨다.
  const { data, error, count } = await query
    .order('end_date', { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);

  return { items: ((data ?? []) as EventRow[]).map(toEventItem), total: count ?? 0 };
}

export async function getReservationOpenEventsPage(
  page = 1,
  pageSize = BROWSE_ALL_PAGE_SIZE,
  categoryMins?: readonly string[]
): Promise<PagedEvents> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // getReservationOpenEvents의 두 조건(booking_status='접수중' OR SEOUL_YEYAK 원본
  // SVCSTATNM='접수중')을 별도 쿼리 두 번 + 병합이 아니라 하나의 or() 그룹으로 합친다 —
  // 오프셋 페이지네이션은 "정확한 count와 안정적인 페이지 경계"가 필요한데, 두 쿼리를 따로
  // 페이지네이션한 뒤 합치면 그 두 조건을 다 만족할 수 없다(제5장 제5조 데이터 중심 —
  // count(*)가 실제 화면과 어긋나면 안 됨).
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('events')
    .select(EVENT_COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
    .not('category_min', 'is', null)
    .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
    .gte('end_date', today)
    .or(`booking_status.eq.접수중,and(source.eq.seoul_public_reservation,raw_data->>SVCSTATNM.eq.접수중)`);
  if (categoryMins && categoryMins.length > 0) query = query.in('category_min', categoryMins);
  // [전체보기 마감임박순 정렬](2026-08-29 사용자 지시): start_date 오름차순은 기간이 매우 긴
  // 이벤트가 맨 앞에 고정되는 문제가 있어 end_date 오름차순(마감임박순)으로 바꿨다.
  const { data, error, count } = await query
    .order('end_date', { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);

  return { items: ((data ?? []) as EventRow[]).map(toEventItem), total: count ?? 0 };
}

// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "GNB 헤더 & 글로벌 위치 상태 공유"):
// 이벤트픽 검색은 events 테이블 전용으로 수행한다(스팟픽의 open_spaces 검색과 분리) — 검색은
// 사용자가 이름을 직접 아는 상태로 찾는 행위라 지역 제한을 걸지 않는다(다른 피드 함수들과
// 달리 region 파라미터 자체가 없음, 추측으로 지역 스코프를 넣지 않는다).
// [검색창/지도 검색 키워드 유연성 대폭 개선](2026-08-30 사용자 지시): 기존에는 title
// 한 필드만, 검색어 전체를 하나의 ILIKE 패턴으로 매칭해 "용인 어린이상상"처럼 띄어
// 쓰면 실제 데이터("용인어린이상상의숲")와 어긋나 누락되는 경우가 있었다 — 검색어를
// 공백 기준 토큰으로 나눠, 각 토큰이 title/description/venue_name 중 어디에든 부분
// 문자열로(대소문자 무시) 존재하기만 하면 매치되도록 넓혔다(요구사항 1/2/3). 141,980행
// open_spaces에서 실측 확인한 것과 동일한 이유로 events.title/description/venue_name에도
// pg_trgm GIN 인덱스를 추가해(2026-08-30-add-trigram-search-indexes.sql) ILIKE 성능
// 저하로 인한 간헐적 타임아웃을 방지했다.
//
// is_active/target_audience/category_min/end_date 필터는 그대로 유지한다 — 이들은
// "이벤트픽은 유아/어린이/가족 대상 콘텐츠 전용"(2026-08-27 사용자 지시, Decision)처럼
// 검색이 아니라 텍스트 매칭과 무관한 별도의 명시적 콘텐츠 큐레이션 결정이라, 이번
// 지시서(텍스트 매칭 유연성 개선)만으로 임의로 되돌리지 않는다(제3장 제5조 추측 금지) —
// 다만 이 필터들 때문에 만료되었거나(is_active=false, end_date 지남) 미분류인 행사는
// 검색해도 여전히 나오지 않을 수 있다는 점은 알아둘 필요가 있다(구현 기록 참고).
export async function searchEvents(keyword: string, limit = 30): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('is_active', true)
    .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
    .not('category_min', 'is', null)
    .not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)
    .gte('end_date', today);

  for (const token of splitSearchTokens(keyword)) {
    const escaped = escapeIlikePattern(token);
    query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%,venue_name.ilike.%${escaped}%`);
  }

  const { data, error } = await query.order('start_date', { ascending: false }).limit(limit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as EventRow[]).map(toEventItem);
}

// [스팟픽 전국구 서버사이드 검색](2026-08-30 사용자 지시): /nearby(스팟픽) 지도 검색이
// 지도 중심/반경 RPC(get_nearby_spaces_and_events)가 이미 내려준 항목을 클라이언트에서
// 다시 텍스트로 거르던 구조였다 — 찾으려는 장소가 현재 지도 화면 밖에 있으면 텍스트
// 매칭을 아무리 잘 고쳐도 애초에 후보 목록에 없어 검색되지 않는 근본적 한계가 있었다
// (2026-08-30-search-keyword-flexibility.md 특이 사항 1번). 지도 중심 좌표와 무관하게
// open_spaces 전체(현재 141,980행)에서 이름/주소로 찾도록 별도 함수로 분리한다 —
// searchEvents와 같은 토큰 단위 다중 필드 ILIKE 패턴을 쓰되, 대상 테이블/컬럼과
// 반환 타입(SPACE 전용)이 달라 하나로 합치지 않는다. 방금 추가한 pg_trgm GIN 트라이그램
// 인덱스(open_spaces.name/address)가 이 전국 스캔의 성능 기반이다.
//
// location_precision='EXACT' 필터는 get_nearby_spaces_and_events RPC와 동일하게
// 유지한다(Decision 009/017) — 좌표가 부정확한 행을 지도에 판으로 찍으면 엉뚱한
// 위치로 이동(panTo)하게 되어 이번 요구사항의 "정확한 좌표로 이동" 취지에 어긋난다.
// 검색어가 비어있으면(공백만 있는 경우 포함) "전체 목록"이라는 의미 없는 결과를 만들지
// 않도록 빈 배열을 반환한다(호출부가 키워드 존재 여부를 판단해 호출하는 게 정상 흐름).
// limit 기본값 201은 get_nearby_spaces_and_events RPC의 기존 관례(마커 상한 200보다
// 하나 더 받아 "더 많은 결과가 있다"는 초과 안내 토스트를 클라이언트가 판단할 수 있게 함,
// 2026-08-28-nearby-rpc-category-min.sql 참고)를 그대로 따른 것이다.
//
// [실측으로 발견한 추가 성능 함정] "부산"처럼 흔한 2글자 지명은 141,980행 중 6,000건
// 이상과 매치되는데, 여기에 order('name')을 걸면 매치된 행 전체를 정렬한 뒤에야
// limit을 적용할 수 있어(정렬은 인덱스로 조기 종료가 안 됨) 1.9~5초가 걸리고, 실제
// PostgREST 8초 statement_timeout 앞에서 라이브 서버로는 실제 타임아웃까지 재현됐다
// (2026-08-25-admin-data-grid-rpcs.sql에 기록된 것과 동일한 PostgREST 8초 제약).
// order를 완전히 빼면 GIN 인덱스 스캔이 limit 건수만 채우고 조기 종료할 수 있어 같은
// 쿼리가 200~300ms로 떨어짐을 실측 확인했다 — 검색 결과는 어차피 "관련도"라는 뚜렷한
// 정렬 기준이 없어(뷰포트 RPC의 distance_meters 같은 개념이 없음) 이름순 정렬을
// 포기해도 손해가 없다.
// [관리자 스팟 큐레이션 탭 자동완성](2026-09-01 사용자 지시): 관리자가 특정 중분류
// (예: '놀이방식당' = "키즈친화 식당") 안에서만 스팟을 찾을 수 있어야 해서 선택적
// categoryMin 필터를 추가한다. /nearby의 일반 검색(전국구, 카테고리 무관)은 이 값을
// 넘기지 않아 기존 동작 그대로 유지된다.
export async function searchSpacesNationwide(
  keyword: string,
  limit = 201,
  categoryMin?: string
): Promise<NearbyItem[]> {
  const tokens = splitSearchTokens(keyword);
  if (tokens.length === 0) return [];

  const supabase = await createClient();
  let query = supabase.from('open_spaces').select(SPACE_COLUMNS).eq('location_precision', 'EXACT');
  if (categoryMin) query = query.eq('category_min', categoryMin);

  for (const token of tokens) {
    const escaped = escapeIlikePattern(token);
    query = query.or(`name.ilike.%${escaped}%,address.ilike.%${escaped}%`);
  }

  const { data, error } = await query.limit(limit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as SpaceRow[]).map(toSpaceItem);
}

// Task 9-5-1(2026-08-22): source_type을 추가했다 — 목적별 테마 스팟 분류(src/lib/theme-spots.ts)에
// 쓰인다(events 테이블에는 이 컬럼 자체가 없어 EVENT_COLUMNS에는 추가하지 않음, 실측 확인).
// [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 실측 중 발견: category_min이 이 SELECT/
// 매핑에 아예 빠져 있었다 — searchSpacesNationwide 결과는 항상 category_min이 undefined였고,
// map-explorer.tsx의 검색 모드 중분류 필터(item.category_min && ...)가 검색 결과에 대해서는
// 한 번도 매치될 수 없는 잠재 버그였다(이번 작업의 관리자 큐레이션 검색이 category_min 필터를
// 요구하면서 발견함). 추가해도 기존 소비처(getFreeFeed 등)는 순수 추가 필드라 영향 없다.
const SPACE_COLUMNS =
  'id, name, category, category_min, address, location, is_free, operating_hours, info_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, sigungu_name, source_type';

type SpaceRow = {
  id: string;
  name: string;
  category: string;
  category_min: string | null;
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
    category_min: row.category_min,
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
// [todo.md 개선사항 4](2026-09-03): open_spaces의 상시 공간 중분류 4종을 이벤트픽
// 화면에서도 함께 조회한다("별도 중복 테이블/데이터를 만들지 않고 원천 데이터를 공유" —
// 실측 확인한 실제 건수: 캠핑장 3,857건/체험휴양마을 1,208건/교육농장 246건/
// 체험학습장 196건, 전부 open_spaces 원본을 그대로 재사용). 이벤트픽 카드/상세는
// item_type이 'EVENT'인지로 분기하므로(FeedCard, DetailModal 등 다수 소비처), 이
// 피드에 한해서만 open_spaces 행을 'EVENT'로 표시 관점에서 재해석해 담는다(원본
// open_spaces 테이블/스팟픽 화면의 item_type='SPACE' 분류는 전혀 바꾸지 않음 — 이
// 함수가 반환하는 NearbyItem은 애초에 화면 표시용 DTO이지 원본 로우 자체가 아니다).
// [이벤트픽 대분류 개편 — 키즈놀이터](2026-09-05 사용자 지시): "여기의 중분류를..
// 추가로 open_spaces의 키즈카페 중분류 가져와서 놔줘" — 위와 동일한 패턴으로 '키즈카페'
// 추가(category-maj-meta.ts CATEGORY_MAJ_OPTIONS의 "키즈놀이터" 대분류와 반드시 동일하게
// 유지). 이벤트에는 이 값이 존재하지 않아(events 쪽 category_min은 '공공키즈카페'/
// '어린이실내놀이터'뿐) open_spaces 쪽만 실제로 채워진다 — 체험휴양마을 등과 동일한 상황.
const SHARED_OPEN_SPACES_CATEGORY_MINS = new Set(['캠핑장', '체험휴양마을', '교육농장', '체험학습장', '키즈카페']);

// [중분류 데이터 로딩 속도 개선 - 페이지네이션 도입](2026-09-04 사용자 지시): 기존에는
// "지역 우선순위 재정렬" 품질을 위해 매 요청마다 이벤트/공간 각각 최대 500건씩(그것도
// 지역 범위를 3단계로 넓혀가며 최대 3번, 실측: 최악의 경우 한 테이블당 최대 1,500건)
// 미리 가져온 뒤 정작 화면에는 20건만 보여줬다 — 흔한 중분류(예: 캠핑장 3,857건)일수록
// 이 500건 상한을 항상 그대로 채워, 필요한 데이터양(20건)과 실제로 내려받는 데이터양의
// 격차가 커서 응답이 느려지는 직접적인 원인이었다. "더보기"로 다음 페이지를 요청할 수
// 있게 되면서 이번 페이지가 필요로 하는 만큼(offset+limit)에 지역 우선순위 재정렬용
// 여유분만 살짝 더해 가져오는 것으로 충분해졌다 — 안전망으로 500 상한은 그대로 두되
// (region 필터 없는 마지막 폴백 단계 등 극단적인 경우 대비), 평소에는 이전보다 훨씬
// 적게 가져온다(예: 1페이지 기준 500 → 80).
const PAGINATION_OVERFETCH_BUFFER = 60;
const PAGINATION_OVERFETCH_CEILING = 500;

export async function getCategoryMinFeed(
  categoryMin: string,
  limit = 20,
  region: HomeRegion = DEFAULT_HOME_REGION,
  offset = 0
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const minRequired = offset + limit;
  const overFetchLimit = Math.min(PAGINATION_OVERFETCH_CEILING, minRequired + PAGINATION_OVERFETCH_BUFFER);

  const buildEventQuery = (token: string | readonly string[] | null) => {
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
    return query.order('start_date', { ascending: false }).limit(overFetchLimit);
  };

  const buildSpaceQuery = (token: string | readonly string[] | null) => {
    let query = supabase
      .from('open_spaces')
      .select(SPACE_COLUMNS)
      .eq('category_min', categoryMin)
      .eq('location_precision', 'EXACT');
    if (token) query = query.or(regionOrFilter(token, 'address'));
    return query.limit(overFetchLimit);
  };

  const isSharedCategory = SHARED_OPEN_SPACES_CATEGORY_MINS.has(categoryMin);
  const [eventData, spaceData] = await Promise.all([
    fetchRegionFirstRows<EventRow>(buildEventQuery, region, minRequired),
    isSharedCategory ? fetchRegionFirstRows<SpaceRow>(buildSpaceQuery, region, minRequired) : Promise.resolve([]),
  ]);

  // [상시 뱃지] toSpaceItem은 start_date/end_date를 항상 null로 채운다 — EventCard의
  // getEventStatus()가 이를 "상시" 상태로 인식해 [상시] 뱃지를 보여준다(날짜 정보가
  // 없어도 자연스럽게 처리되도록 event-status.ts에도 분기를 추가했다).
  const spaceItems = spaceData.map((row) => ({ ...toSpaceItem(row), item_type: 'EVENT' as const }));
  const items = dedupeAndMergeFree([...eventData.map(toEventItem), ...spaceItems]);
  const ordered = sortByDistanceIfKnown(items, region);
  return selectRegionFirst(ordered, region, offset, limit);
}

// [todo.md 개선사항 3](2026-09-03): 실측으로 발견한 원인 — 대분류/중분류 바텀시트 배선
// 자체(선택 상태→쿼리→렌더링)는 정상이었지만, 일부 중분류(예: "교양/어학")는
// is_active+target_audience(가족·아동)+진행중 3개 조건을 동시에 만족하는 행이
// DB에 0건이라 클릭해도 "조건에 맞는 행사를 찾는 중입니다"에서 영원히 멈춰
// 고장난 것처럼 보였다(실측: 25건 중 가족 대상 태깅 0건). 지역 필터 없이(region은
// 결과를 줄이기만 하므로 "구조적으로 0건"인지 판단하는 데는 불필요) 전역 카운트를
// 미리 계산해, 애초에 매칭될 수 없는 중분류는 바텀시트에서 숨긴다(스팟픽 바텀시트에
// 사용자가 이미 요구한 "0건 중분류 제외" 원칙을 이벤트픽에도 동일하게 적용 —
// 제5장 제4조 기존 구조 우선).
export async function getCategoryMinCounts(categoryMins: readonly string[]): Promise<Record<string, number>> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const entries = await Promise.all(
    categoryMins.map(async (categoryMin) => {
      const { count, error } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('category_min', categoryMin)
        .eq('is_active', true)
        .in('target_audience', EVENT_PICK_TARGET_AUDIENCES)
        .lte('start_date', today)
        .gte('end_date', today);
      if (error) {
        console.error(`[getCategoryMinCounts] ${categoryMin} 카운트 조회 실패: ${error.message}`);
        return [categoryMin, 1] as const; // 조회 실패 시엔 "있을 수도 있다"고 보수적으로 보여준다(숨기지 않음)
      }

      // [todo.md 개선사항 4](2026-09-03): 캠핑장/체험휴양마을/교육농장/체험학습장은
      // 이벤트 자체는 거의 없고 open_spaces 원본이 실제 콘텐츠다 — events 카운트만
      // 보면 항상 0으로 나와 실제로는 수천 건이 있는데도 바텀시트에서 숨겨질 뻔했다.
      if (SHARED_OPEN_SPACES_CATEGORY_MINS.has(categoryMin)) {
        const spaceCountResult = await supabase
          .from('open_spaces')
          .select('id', { count: 'exact', head: true })
          .eq('category_min', categoryMin)
          .eq('location_precision', 'EXACT');
        if (!spaceCountResult.error) {
          return [categoryMin, (count ?? 0) + (spaceCountResult.count ?? 0)] as const;
        }
      }

      return [categoryMin, count ?? 0] as const;
    })
  );

  return Object.fromEntries(entries);
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
    getTodayEvents(HERO_FETCH_LIMIT, region, undefined, true),
    getFreeFeed(12, region),
    getReservationOpenEvents(RESERVATION_OPEN_FETCH_LIMIT, region),
    getCurrentlyOngoingEvents(CURRENTLY_ONGOING_FETCH_LIMIT, region),
  ]);

  // [개선사항2](2026-09-04 사용자 지시) "'오늘 가능' 영역 중복 제거": getTodayEvents는
  // end_date=오늘인 행사만 뽑고, getCurrentlyOngoingEvents는 "오늘이 start_date~end_date
  // 진행 기간 안"인 행사를 뽑는다 — end_date=오늘이면 거의 항상(오늘이 아직 지나지
  // 않았으므로) start_date<=오늘<=end_date도 함께 만족해, Hero에 뜬 "오늘 한정/오늘
  // 마감" 행사가 바로 아래 "현재 이용 가능"에도 그대로 다시 뜨는 중복이 구조적으로
  // 발생했다(실측 확인 — 두 조회 사이에 id 교집합 배제 로직이 전혀 없었다). Hero에
  // 이미 나온 항목은 여기서 제외한다.
  const heroIds = new Set(heroEvents.map((item) => item.id));
  const dedupedCurrentlyOngoing = currentlyOngoingEvents.filter((item) => !heroIds.has(item.id));

  return { heroEvents, freeFeed, reservationOpenEvents, currentlyOngoingEvents: dedupedCurrentlyOngoing };
}
