// 신규 소스 어댑터가 공통으로 사용하는 "5대 카테고리 / 4대 핵심 뱃지" 매핑 인터페이스.
// docs/spec.md 3.2, spec/data/ai-rule.md 3.3(UI 카테고리 매핑) 기준.
//
// 주의: DB의 `category`/`event_type` 컬럼에는 CHECK 제약이 없어(VARCHAR),
// 기존 7대 공공 API 소스가 쓰는 원본 세부값(PARK/SPORTS/CULTURE/FESTIVAL 등)과
// 이 5대 UI 카테고리 값이 같은 컬럼에 공존한다. 프론트엔드 category-meta.ts에도
// 동일한 5개 키가 추가되어 있어야 정상 렌더링된다.
export const UI_CATEGORY = Object.freeze({
  EXPERIENCE_CLASS: 'EXPERIENCE_CLASS', // 🎨 체험·클래스
  OUTDOOR_NATURE: 'OUTDOOR_NATURE', // 🌳 야외·자연
  EXHIBITION_MUSEUM: 'EXHIBITION_MUSEUM', // 🏛️ 전시·박물관
  PERFORMANCE_FESTIVAL: 'PERFORMANCE_FESTIVAL', // 🎪 공연·축제
  KIDS_ACTIVITY: 'KIDS_ACTIVITY', // 🎡 키즈·액티비티
});

// spec/data/ai-rule.md 4.1 예외 처리 원칙: 명확히 판별 불가한 경우 임의 카테고리로
// 끼워 맞추지 않고 null을 반환한다. 호출부에서 null인 행은 수집은 하되 UI 카테고리
// 필터에는 노출하지 않거나(ETC 취급) 별도 검토 대상으로 남긴다.
export function resolveUiCategory(candidate) {
  return Object.values(UI_CATEGORY).includes(candidate) ? candidate : null;
}

// 가성비 뱃지 (docs/spec.md 3.2 4대 핵심 뱃지 #1)
export function classifyPriceBadge(isFree, priceKrw) {
  if (isFree) return 'FREE';
  if (typeof priceKrw === 'number' && Number.isFinite(priceKrw)) {
    return priceKrw <= 10000 ? 'UNDER_10K' : 'PAID';
  }
  return 'PAID';
}

// 실내외 뱃지 정규화 (#3) — 알 수 없으면 ai-rule.md 5.2-4 기본값 '복합'
export function normalizeFacilityType(raw) {
  if (raw === '실내' || raw === '야외') return raw;
  return '복합';
}

// Task 9-1-12(2026-08-22): 특별시/광역시 8곳의 공식 명칭 → 표기용 축약 명칭.
// "동구"/"북구"/"중구" 등은 서울·부산·대구·인천·광주·대전·울산에 전부 존재해 시/군/구
// 단독 표기만으로는 어느 도시인지 알 수 없다(실측 확인 — 사용자 지적). 이 표는 대한민국
// 공식 행정구역 명칭을 그대로 축약한 것이라 추측이 아니다(제3장 제5조 추측 금지와 무관).
const METRO_CITY_SHORT_NAME = {
  서울특별시: '서울시',
  부산광역시: '부산시',
  대구광역시: '대구시',
  인천광역시: '인천시',
  광주광역시: '광주시',
  대전광역시: '대전시',
  울산광역시: '울산시',
  세종특별자치시: '세종시',
};

// Task 9-1-3(2026-08-22): 주소 문자열에서 "시/군/구" 단위를 추출한다.
// 한국 행정구역 주소는 "{시/도} {시/군/구} {상세...}" 순서이나, 경기도 등 일부 지역은
// 시(市) 아래에 또 구(區)가 있는 2단 구조(예: "경기도 성남시 분당구")를 가진다.
// 실측 확인(2026-08-22): 도 지역 중 구가 있는 시는 2·3번째 토큰을 합쳐야 함
// ("경기도 성남시 분당구"). 판별 불가(예: 세종시처럼 구/군 단위가 아예 없는 주소)면
// 임의로 만들어내지 않고 null 반환.
// Task 9-1-12(2026-08-22) 보완: 특별시/광역시는 2번째 토큰이 바로 구지만("서울특별시
// 강남구"), "강남구" 단독 표기만으로는 모호하지 않은 반면 "동구"/"북구"/"중구" 등은 여러
// 도시에 동일하게 존재해(부산 동구·대구 동구·인천 동구·울산 동구 등) 단독 표기가 실제로
// 헷갈린다는 사용자 지적을 반영해, 이제 1번째 토큰(시/도)의 축약명을 항상 앞에 붙인다
// (예: "울산시 동구", "광주시 북구", "서울시 강남구").
export function extractSigunguName(address) {
  if (!address) return null;

  const tokens = address.trim().split(/\s+/);
  const province = tokens[0];
  const first = tokens[1];
  if (!first) return null;

  if (/(시|군)$/.test(first)) {
    const second = tokens[2];
    if (second && /구$/.test(second)) {
      return `${first} ${second}`;
    }
    return first;
  }

  if (/구$/.test(first)) {
    const shortCity = METRO_CITY_SHORT_NAME[province];
    return shortCity ? `${shortCity} ${first}` : first;
  }

  return null;
}

// open_spaces 스키마 행 빌더 (project/database_schema.md 3.1 + Parental 컬럼)
export function buildOpenSpaceRow({
  externalId,
  sourceType,
  name,
  uiCategory,
  address,
  lng,
  lat,
  isFree = null,
  operatingHours = null,
  infoUrl = null,
  isKidsFriendly = false,
  hasParking = false,
  strollerAccessible = false,
  facilityType = '복합',
  targetAgeGroup = null,
  rawData = null,
  sigunguName = undefined,
}) {
  if (!externalId || !sourceType || !name || !lng || !lat) return null;

  return {
    external_id: externalId,
    source_type: sourceType,
    name,
    category: resolveUiCategory(uiCategory) ?? 'ETC',
    address: address || '',
    location: `SRID=4326;POINT(${lng} ${lat})`,
    is_free: isFree,
    operating_hours: operatingHours,
    info_url: infoUrl,
    is_kids_friendly: isKidsFriendly,
    has_parking: hasParking,
    stroller_accessible: strollerAccessible,
    facility_type: normalizeFacilityType(facilityType),
    target_age_group: targetAgeGroup,
    raw_data: rawData,
    // Task 9-1-3: 명시적으로 넘어온 값이 없으면 address에서 자동 추출한다(모든 open_spaces
    // 어댑터가 address를 이미 갖고 있으므로 각 어댑터를 개별 수정할 필요가 없다).
    sigungu_name: sigunguName !== undefined ? sigunguName : extractSigunguName(address),
  };
}

// events 스키마 행 빌더 (실제 라이브 DB 스키마 기준 — project/database_schema.md 문서상에는
// `category`/`source_type` 컬럼이 events에도 있는 것처럼 기재돼 있었으나 실제로는 존재하지
// 않음을 upsert 실패로 확인함(2026-08-22). events는 `event_type` 하나로 카테고리를 표현하며,
// 소스 구분은 external_id 접두어 관례(예: SEOUL_YEYAK_...)로 대신한다. 문서도 함께 정정함.
export function buildEventRow({
  externalId,
  title,
  uiCategory,
  startDate,
  endDate,
  lng,
  lat,
  isReservationRequired = false,
  reservationUrl = null,
  reservationStartDate = null,
  reservationEndDate = null,
  isFree = null,
  thumbnailUrl = null,
  isKidsFriendly = false,
  hasParking = false,
  strollerAccessible = false,
  facilityType = '복합',
  targetAgeGroup = null,
  bookingStatus = null,
  isActive = true,
  venueName = null,
  sigunguName = null,
}) {
  if (!externalId || !title || !startDate || !endDate || !lng || !lat) return null;

  return {
    external_id: externalId,
    title,
    event_type: resolveUiCategory(uiCategory) ?? 'ETC',
    start_date: startDate,
    end_date: endDate,
    location: `SRID=4326;POINT(${lng} ${lat})`,
    is_reservation_required: isReservationRequired,
    reservation_start_date: reservationStartDate,
    reservation_end_date: reservationEndDate,
    reservation_url: reservationUrl,
    is_free: isFree,
    thumbnail_url: thumbnailUrl,
    is_kids_friendly: isKidsFriendly,
    has_parking: hasParking,
    stroller_accessible: strollerAccessible,
    facility_type: normalizeFacilityType(facilityType),
    target_age_group: targetAgeGroup,
    booking_status: bookingStatus,
    is_active: isActive,
    // Task 9-1-1: 원본 API의 실제 장소명 필드(예: PLACENM)를 그대로 저장한다(추측/생성 없음).
    venue_name: venueName,
    // Task 9-1-3: events는 공통 address 컬럼이 없어 자동 추출이 불가능하므로, 호출부가
    // 원본 API의 실제 구/지역명 필드(예: GUNAME/AREANM)나 주소(addr1)에서 뽑아 명시적으로 넘긴다.
    sigungu_name: sigunguName,
  };
}
