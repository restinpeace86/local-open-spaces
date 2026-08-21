import { createClient } from '@/lib/supabase/server';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// Task 9-1(2026-08-22): 홈 화면 Hero Carousel/큐레이션 피드용 서버 사이드 조회 로직.
// /api/home/feed 라우트와 홈 페이지 Server Component가 이 함수들을 공유해서 쓴다
// (같은 로직을 두 번 구현하지 않고, API 라우트가 Server Component 안에서 자기 자신을
// fetch하는 안티패턴도 피한다).

function extractCoords(location: unknown): { lng: number; lat: number } {
  const geometry = location as { coordinates: [number, number] } | null;
  return { lng: geometry?.coordinates?.[0] ?? 0, lat: geometry?.coordinates?.[1] ?? 0 };
}

const EVENT_COLUMNS =
  'id, title, event_type, location, thumbnail_url, start_date, end_date, reservation_start_date, reservation_end_date, reservation_url, is_reservation_required, is_free, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, booking_status';

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
};

function toEventItem(row: EventRow): NearbyItem {
  const { lng, lat } = extractCoords(row.location);
  return {
    id: row.id,
    name: row.title,
    category: row.event_type,
    distance_meters: -1,
    item_type: 'EVENT',
    lng,
    lat,
    // Task 9-1에서 발견한 Mismatch: events 테이블에는 장소명을 담을 컬럼이 없고(space_id FK도
    // 실제로는 전량 NULL — 실측 확인), 그래서 이벤트 카드의 "장소" 표시는 현재 채울 데이터가 없다.
    address: null,
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

// docs/spec.md 2.2 ①: "당일 진행 중인 행사/이벤트 중 추천 5~10개 동적 페칭"
// docs/spec.md 1: "사전 예약 마감건은 제외하고, 오늘/주말 당일 즉시 방문 가능한 정보를 우선 추천"
export async function getTodayEvents(limit = 10): Promise<NearbyItem[]> {
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
    .limit(limit);

  if (error) throw new Error(`오늘의 행사 조회 실패: ${error.message}`);

  return (data ?? []).map(toEventItem);
}

// docs/spec.md 2.2 ③: "🎁 0원의 행복 — 지출 부담 없는 완전 무료 공공장소/행사 카드"
// open_spaces + events 양쪽에서 is_free = true인 항목을 함께 큐레이션한다.
export async function getFreeFeed(limit = 12): Promise<NearbyItem[]> {
  const supabase = await createClient();

  const [spacesResult, eventsResult] = await Promise.all([
    supabase
      .from('open_spaces')
      .select(
        'id, name, category, address, location, is_free, operating_hours, info_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group'
      )
      .eq('is_free', true)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('is_free', true)
      .eq('is_active', true)
      .order('start_date', { ascending: false })
      .limit(limit),
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
      item_type: 'SPACE',
      lng,
      lat,
      address: row.address,
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

  return [...spaceItems, ...eventItems].slice(0, limit);
}

export type HomeFeed = {
  heroEvents: NearbyItem[];
  freeFeed: NearbyItem[];
};

export async function getHomeFeed(): Promise<HomeFeed> {
  const [heroEvents, freeFeed] = await Promise.all([getTodayEvents(10), getFreeFeed(12)]);
  return { heroEvents, freeFeed };
}
