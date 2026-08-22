import { createClient } from '@/lib/supabase/server';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// Task 9-1(2026-08-22): 홈 화면 Hero Carousel/큐레이션 피드용 서버 사이드 조회 로직.
// /api/home/feed 라우트와 홈 페이지 Server Component가 이 함수들을 공유해서 쓴다
// (같은 로직을 두 번 구현하지 않고, API 라우트가 Server Component 안에서 자기 자신을
// fetch하는 안티패턴도 피한다).
//
// Task 9-1-3(2026-08-22): 매 요청마다 좌표 간 Haversine 거리를 계산해 반경 30km로 필터링하던
// 방식(Task 9-1-1)을 완전히 제거했다. 대신 인덱싱된 sigungu_name 컬럼 값으로 "유저가 선택한
// 지역"을 1순위로, 그 외 지역을 2순위로 재정렬한다(제외하지 않음 — 지역 데이터가 적은 사용자도
// 피드가 텅 비지 않도록). 이 방식은 애플리케이션 레벨의 삼각함수 계산이 전혀 없어 응답이 더 빠르다.

export type HomeRegion = { sigunguName: string | null };

// Task 9-1-1에서 정한 기본값(성남시 분당구 — 실제 지오코딩된 자사 DB 좌표 기준)의 지역명을
// 그대로 계승한다(추측 없음).
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

// Task 9-1-3: 유저가 선택한 지역(region.sigunguName)과 일치하는 항목을 1순위로, 그 외 지역을
// 2순위로 정렬한다(제외하지 않음). Array.sort는 안정 정렬이므로 각 순위 그룹 내부의 기존
// 정렬(최신순 등)은 그대로 유지된다.
function byRegionPriority(region: HomeRegion) {
  return (a: NearbyItem, b: NearbyItem): number => {
    const aRank = region.sigunguName && a.sigungu_name === region.sigunguName ? 0 : 1;
    const bRank = region.sigunguName && b.sigungu_name === region.sigunguName ? 0 : 1;
    return aRank - bRank;
  };
}

// Task 9-1-6: Hero Carousel 전용 "Strict Location-First" 선택. byRegionPriority(정렬만 하고
// 배제하지 않음)와 달리, 선택 지역 항목만으로 limit이 충족되면 다른 지역 항목은 최종 결과에서
// 완전히 배제한다. 선택 지역 데이터가 부족할 때만 다른 지역 데이터로 남은 자리를 채운다.
function selectRegionFirst(items: NearbyItem[], region: HomeRegion, limit: number): NearbyItem[] {
  if (!region.sigunguName) return items.slice(0, limit);

  const matching = items.filter((item) => item.sigungu_name === region.sigunguName);
  if (matching.length >= limit) return matching.slice(0, limit);

  const others = items.filter((item) => item.sigungu_name !== region.sigunguName);
  return [...matching, ...others].slice(0, limit);
}

// docs/spec.md 2.2 ①: "당일 진행 중인 행사/이벤트 중 추천 5~10개 동적 페칭"
// docs/spec.md 1: "사전 예약 마감건은 제외하고, 오늘/주말 당일 즉시 방문 가능한 정보를 우선 추천"
// Task 9-1-6: Hero Carousel은 Strict Location-First — 선택 지역 당일 이벤트로 limit이 충족되면
// 다른 지역 이벤트는 완전히 배제한다(부족할 때만 다른 지역으로 최소 보충).
export async function getTodayEvents(
  limit = 10,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .lte('start_date', today)
    .gte('end_date', today)
    .eq('is_active', true)
    // 예약 필수이면서 이미 마감된 건은 DB 단에서 제외(마감 안 지난 것 OR 예약 불필요)
    .or(`is_reservation_required.eq.false,reservation_end_date.gte.${nowIso},reservation_end_date.is.null`)
    .order('start_date', { ascending: false })
    .limit(500);

  if (error) throw new Error(`오늘의 행사 조회 실패: ${error.message}`);

  const items = dedupeAndMergeFree((data ?? []).map(toEventItem));
  return selectRegionFirst(items, region, limit);
}

// docs/spec.md 2.2 ③: "🎁 0원의 행복 — 지출 부담 없는 완전 무료 공공장소/행사 카드"
export async function getFreeFeed(
  limit = 12,
  region: HomeRegion = DEFAULT_HOME_REGION
): Promise<NearbyItem[]> {
  const supabase = await createClient();

  const [spacesResult, eventsResult] = await Promise.all([
    supabase
      .from('open_spaces')
      .select(
        'id, name, category, address, location, is_free, operating_hours, info_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, sigungu_name'
      )
      .eq('is_free', true)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('is_free', true)
      .eq('is_active', true)
      .order('start_date', { ascending: false })
      .limit(500),
  ]);

  if (spacesResult.error) throw new Error(`무료 공간 조회 실패: ${spacesResult.error.message}`);
  if (eventsResult.error) throw new Error(`무료 행사 조회 실패: ${eventsResult.error.message}`);

  const spaceItems: NearbyItem[] = (spacesResult.data ?? []).map((row) => {
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
    };
  });

  const eventItems: NearbyItem[] = (eventsResult.data ?? []).map(toEventItem);

  const merged = dedupeAndMergeFree([...spaceItems, ...eventItems]);
  return merged.sort(byRegionPriority(region)).slice(0, limit);
}

export type HomeFeed = {
  heroEvents: NearbyItem[];
  freeFeed: NearbyItem[];
};

export async function getHomeFeed(region: HomeRegion = DEFAULT_HOME_REGION): Promise<HomeFeed> {
  const [heroEvents, freeFeed] = await Promise.all([
    getTodayEvents(10, region),
    getFreeFeed(12, region),
  ]);
  return { heroEvents, freeFeed };
}
