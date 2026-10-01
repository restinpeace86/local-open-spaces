// [스마트서울맵 공통 변환 로직](2026-10-01 사용자 지시) — 5개 테마 어댑터가
// 공유하는 raw→open_spaces 행 변환(제5장 제4조 기존 구조 우선, 5번 복제 금지).
// 콘텐츠 리스트 API 응답 필드(COT_*)는 reference/MGIS_ApplicationServer_Doc
// (OpenAPIV5).pdf 4.2절 기준.
import crypto from 'crypto';
import { buildOpenSpaceRow } from './schema-mapper.mjs';

// [짧은 해시 external_id 채택 경위](2026-10-01 실측 장애): 처음엔
// `SMART_SEOUL_{themeId}_{COT_CONTS_ID}`를 그대로 썼는데(최대 58자), 오케이존
// 654건을 upsertRowsSafeMerge()가 내부적으로 200건씩 끊어 기존 행을 GET
// `.in()`으로 조회하는 구간에서 URL이 너무 길어져("fetch failed", 두 번의
// 독립 실행에서 동일하게 재현) 1~600번째 행이 매번 실패했다. 이 GET 길이
// 한도(SELECT_LOOKUP_BATCH_SIZE=200)는 공용 upsertRowsSafeMerge()가 다른
// 25개 이상의 기존 소스가 쓰는 "짧은" external_id 기준으로 이미 검증된
// 값이라(scripts/ingest/lib/supabase-admin.mjs, 2026-08-25 실측), 그 공용
// 함수를 건드리는 대신(제5장 제4조 — 영향 범위가 이 세션 지시 "완전 별도
// 파이프라인"을 벗어남) 이 소스의 external_id 자체를 rural-experience-
// village-adapter.mjs와 동일한 패턴(SHA1 해시 16자)으로 짧게 줄인다.
export function buildSmartSeoulMapExternalId(themeId, contentId) {
  if (!contentId) return null;
  const hash = crypto.createHash('sha1').update(`${themeId}|${contentId}`).digest('hex').slice(0, 16);
  return `SMART_SEOUL_${hash}`;
}

function resolveName(item) {
  return item.COT_CONTS_NAME || null;
}

function resolveAddress(item) {
  return item.COT_ADDR_FULL_NEW || item.COT_ADDR_FULL_OLD || '';
}

// [좌표 결측 방어](2026-10-01 실측): 테마별로 극소수(1건 내외) 좌표 누락 항목이
// 있었다(편한외출 서울키즈 오케이존 655건 중 1건, 유아숲 체험시설 373건 중
// 1건 — 300km 반경을 최대로 키워도 동일했음, 즉 좌표 자체가 없는 원본 데이터).
// 드롭하지 않고 location_precision='UNKNOWN'으로 보존한다(Decision 017과 동일한
// null-safe 원칙).
function resolveCoords(item) {
  const lng = Number(item.COT_COORD_X);
  const lat = Number(item.COT_COORD_Y);
  if (Number.isFinite(lng) && Number.isFinite(lat) && lng !== 0 && lat !== 0) {
    return { lng, lat };
  }
  return null;
}

// themeId/uiCategory/categoryMin/serviceCategoryId는 테마별 어댑터가 고정값으로
// 넘긴다(한 어댑터는 항상 하나의 테마만 다루므로 raw item마다 달라지지 않음).
export function transformSmartSeoulMapContent(item, { themeId, uiCategory, categoryMin, serviceCategoryId }) {
  const name = resolveName(item);
  const externalId = buildSmartSeoulMapExternalId(themeId, item.COT_CONTS_ID);
  if (!name || !externalId) return null;

  const address = resolveAddress(item);
  const coords = resolveCoords(item);

  const row = buildOpenSpaceRow({
    externalId,
    sourceType: 'SMART_SEOUL_MAP',
    source: 'smart_seoul_map',
    name,
    uiCategory,
    address,
    lng: coords?.lng,
    lat: coords?.lat,
    locationPrecision: coords ? 'EXACT' : 'UNKNOWN',
    // [요금/운영시간 정보 없음](제3장 제5조 추측 금지): 콘텐츠 리스트 응답에
    // 요금/영업시간 전용 필드가 없다(COT_VALUE_01/03은 테마마다 라벨이 달라
    // 구조화된 요금 필드로 신뢰할 수 없음, 실측 확인) — 추측해서 채우지 않고
    // null로 둔다.
    isFree: null,
    operatingHours: null,
    infoUrl: null,
    rawData: item,
    categoryMin,
    categoryMinSource: 'MANUAL',
  });
  if (!row) return null;

  row.service_category_id = serviceCategoryId;
  return row;
}
