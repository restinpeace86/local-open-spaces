import { createClient } from '@/lib/supabase/client';

export type NearbyItem = {
  id: string;
  name: string;
  category: string;
  distance_meters: number;
  item_type: 'SPACE' | 'EVENT';
  lng: number;
  lat: number;
  address: string | null;
  thumbnail_url: string | null;
  start_date: string | null;
  end_date: string | null;
  reservation_start_date: string | null;
  reservation_end_date: string | null;
  reservation_url: string | null;
  is_reservation_required: boolean | null;
  operating_hours: string | null;
  is_free: boolean | null;
  info_url: string | null;
  is_kids_friendly: boolean | null;
  has_parking: boolean | null;
  stroller_accessible: boolean | null;
  facility_type: string | null;
  target_age_group: string | null;
  booking_status: string | null;
  // Task 9-1-3: 홈 피드 전용(반경/거리 계산 제거 후 위치 표기용) — get_nearby_spaces_and_events
  // RPC 결과에는 아직 없어 optional로 둔다(있으면 사용, 없으면 formatVenueLine이 거리로 대체).
  sigungu_name?: string | null;
  // Task 9-5-1(2026-08-22): 목적별 테마 스팟 분류(src/lib/theme-spots.ts)용 — get_nearby_spaces_and_events
  // RPC(이 Task 범위 밖) 결과에는 없어 optional. 홈/카테고리 화면 경로만 채워 넣는다.
  source_type?: string | null;
  // Task 9-6-2(2026-08-23, Decision 009): 'EXACT'(실제 주소 지오코딩) | 'CITY_APPROX'(시/군
  // 중심좌표 근사) | 'UNKNOWN'(좌표 없음). get_nearby_spaces_and_events RPC는 EXACT만 반환하므로
  // 이 필드가 없고(undefined), open_spaces도 컬럼 자체가 없어 undefined다 — undefined는 EXACT로
  // 간주한다(DetailModal 등 소비 측 규약). get-home-feed.ts의 events 조회 경로만 실제 값을 채운다.
  location_precision?: 'EXACT' | 'CITY_APPROX' | 'UNKNOWN' | null;
  // Task 9-6-11(2026-08-25, Decision 011): 유료/민간 제휴 CTA("🎟️ 할인 예매하기") 판별용.
  // 커머스 제휴(쿠팡 파트너스 등) 데이터 파이프라인은 Decision 008 영향란에서 별도 승인 대기 중인
  // 미착수 항목이라 DB/RPC에 아직 컬럼이 없다 — 항상 undefined(=미존재)로 들어오며, 파이프라인이
  // 붙으면 값이 채워진다. 그 전까지 DetailModal의 조건부 CTA는 이 필드가 비어 있으므로 자동으로
  // "길찾기" 등 다른 분류로 폴백한다.
  affiliate_url?: string | null;
  // [카드 표준 중분류/연령대상 표시](2026-08-27 사용자 지시): 카드 상단 뱃지를 event_type
  // 기반 5대 UI 카테고리(예: "체험·클래스") 대신 실제 표준 중분류(category_min, 예: "도시농업")
  // 로 보여주고, 상세보기에 연령대상(target_audience)을 추가하기 위한 필드. get-home-feed.ts의
  // events 조회 경로가 채운다. [스팟픽 대분류/중분류 계층적 탐색](2026-08-28)부터
  // get_nearby_spaces_and_events RPC(SPACE 대상)도 open_spaces.category_min을 함께
  // 반환하도록 확장했다(2026-08-28-nearby-rpc-category-min.sql) — 여전히 optional인 이유는
  // open_spaces 쪽 category_min이 아직 전량 채워지지 않았고(일부 NULL 잔존, docs/
  // null-category-analysis.md 참고) target_audience는 events 전용 개념이라 SPACE에는 항상
  // undefined이기 때문이다.
  category_min?: string | null;
  target_audience?: string | null;
  // [상세보기 설명 추가](2026-08-27 사용자 지시): 제목만으로는 무슨 행사인지 알기 어려운
  // 경우가 많아 상세 팝업에 본문 설명을 추가한다. get-home-feed.ts의 events 조회 경로만
  // 채운다(공간/RPC 경로는 이 컬럼을 조회하지 않아 undefined로 남는다).
  description?: string | null;
};

// Task 9-6-10(2026-08-23): itemType을 넘기면 RPC가 해당 타입만 반환한다(예: '/nearby' 지도는
// 상시 공간 전용이라 'SPACE'만 넘김). 생략하면 기존과 동일하게 SPACE+EVENT를 모두 반환한다 —
// generate-notifications.ts(D-1 예약 마감 알림, EVENT만 걸러 씀)가 이 함수를 인자 없이 그대로
// 호출하므로 하위 호환이 깨지면 안 된다.
export async function getNearbySpacesAndEvents(
  lng: number,
  lat: number,
  radiusMeters: number,
  itemType?: 'SPACE' | 'EVENT'
): Promise<NearbyItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('get_nearby_spaces_and_events', {
    user_lng: lng,
    user_lat: lat,
    radius_meters: radiusMeters,
    ...(itemType ? { p_item_type: itemType } : {}),
  });

  if (error) {
    throw new Error(`주변 공간/행사 조회 실패: ${error.message}`);
  }

  return (data ?? []) as NearbyItem[];
}
