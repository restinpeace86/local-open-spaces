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

// docs/spec.md 2.2 ③ / Task 9-1-3: "정규화된 (행사명/공간명 + 시군구)" 기준 중복 제거.
// 공백 제거 + 대소문자 무시로 이름을 정규화하고, 시군구가 없으면 빈 문자열로 묶는다
// (같은 이름 + 같은 지역이면 같은 항목으로 취급). 동일 키에 is_free: true가 하나라도 있으면
// 최종 카드를 is_free: true로 병합해 1건만 남긴다.
function normalizeDedupKey(item: NearbyItem): string {
  const normalizedName = item.name.trim().toLowerCase().replace(/\s+/g, '');
  return `${normalizedName}|${item.sigungu_name ?? ''}`;
}

function dedupeAndMergeFree(items: NearbyItem[]): NearbyItem[] {
  const merged = new Map<string, NearbyItem>();

  for (const item of items) {
    const key = normalizeDedupKey(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      continue;
    }

    if (item.is_free === true && existing.is_free !== true) {
      merged.set(key, { ...item, is_free: true });
    } else if (existing.is_free === true) {
      merged.set(key, { ...existing, is_free: true });
    }
  }

  return Array.from(merged.values());
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
