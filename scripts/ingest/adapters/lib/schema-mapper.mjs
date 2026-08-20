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
  };
}
