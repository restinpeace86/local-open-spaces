// Task 9-6-3(2026-08-23): 활성/미래(end_date >= 오늘) 이벤트 중 location_precision이
// 'CITY_APPROX'/'UNKNOWN'인 행을 상세 페이지 스크래핑 + 지오코딩으로 보완해 'EXACT'로 승격한다.
//
// 실측 확인(2026-08-23): 이 조건에 해당하는 49건 전부 API1(GG_CULTURE_EVENT_ 접두어,
// ggc.ggcf.kr) 소스였다. API2(GG_FOUNDATION_EVENT_)는 수집 시점에 LOC_NM을 이미 직접
// 지오코딩해서, 실패하면 애초에 행 자체를 만들지 않는다(gg-culture-events-adapter.mjs
// transformFoundationEvents 참고) — 그래서 API2발 CITY_APPROX/UNKNOWN은 구조적으로 존재하지
// 않는다(실측으로 0건 확인). 따라서 이 보완 스크립트는 API1 소스만 다룬다.
//
// 지시서는 "네이버/카카오 지오코딩 API"를 언급했으나, 이 프로젝트에는 서버사이드로 쓸 수 있는
// 키가 없다 — 실제 호출로 확인함(2026-08-23):
//   - NEXT_PUBLIC_KAKAO_MAP_API_KEY는 카카오맵 JS SDK 전용 키(브라우저 도메인 제한)라
//     dapi.kakao.com/v2/local/search/address.json에 직접 요청하면 401
//     "KA Header is required but neither os nor origin field is given"로 거부된다.
//     (REST API 전용 별도 키가 필요하며 현재 프로젝트에 없음.)
//   - 네이버(NAVER_CLIENT_ID/SECRET 등)는 .env.local에 아예 설정돼 있지 않다.
// 따라서 이미 이 프로젝트 전체 파이프라인에서 검증되어 쓰이고 있는 VWorld 지오코더
// (vworld-geocoder.mjs)를 재사용한다(제5장 제4조 기존 구조 우선 — 새 Provider를 무리하게
// 끼워 넣지 않음). 최종 좌표 결과물은 지오코딩 Provider와 무관하게 동일하다.
//
// 지시서의 "address" 컬럼도 events 테이블에는 존재하지 않는다(open_spaces와 달리 events는
// address가 없고 venue_name을 쓴다 — Task 9-6-1/9-6-2에서 이미 실측 확인/정정한 스키마).
// 이 스크립트는 venue_name/location/location_precision 3개 컬럼만 갱신한다.
//
// 원본 URL 복원: external_id는 원본 item.URL의 SHA1 해시라 DB에 URL 원문이 저장돼 있지 않다
// (events 테이블에 URL 컬럼 자체가 없음). API1을 다시 fetch해 동일한 buildExternalId 규칙으로
// 재계산한 뒤 DB의 대상 external_id와 매칭시켜 URL을 복원한다(buildUrlLookup) — 이를 위해
// 새 컬럼을 추가하지 않는다(데이터 구조 변경 최소화, 제5장 제3조).
//
// 상세 페이지 구조(3건 표본 실측 확인, 2026-08-23): <dl><dt>장 소</dt><dd>{venue}</dd></dl>
// 패턴이 페이지당 정확히 1회 등장하며 실제 장소명을 담고 있다(예: "경기도자미술관 상설전시실
// 2,3층"). 지시서가 언급한 "주소"/"위치"/"도로명" 키워드는 이 사이트 템플릿에서는 <!-- 주석
// 처리된 --> 잔재 코드에만 등장하고("경기도 수원시 팔달구 효원로 307번길 경기아트센터"라는
// 모든 페이지에 동일하게 박힌 예시값 — 실제 데이터가 아님), 실제로 쓰면 완전히 잘못된 주소를
// 모든 행에 똑같이 채워 넣게 된다 — 실측으로 이 함정을 발견해 피했다(추측 금지 원칙).
import { cleanText } from '../lib/ai-tagging.mjs';
import { geocode } from './lib/vworld-geocoder.mjs';
import { GYEONGGI_BOUNDS, isWithinGyeonggiBounds } from './gg-culture-events-adapter.mjs';

export const API1_EXTERNAL_ID_PREFIX = 'GG_CULTURE_EVENT_';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const VENUE_FIELD_REGEX = /<dt>\s*장\s*소\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/;
const FETCH_PACING_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// API1 raw item 목록에서 "재계산한 external_id → 원본 URL" 조회 맵을 만든다.
// gg-culture-events-adapter.mjs의 transformCultureEvents와 완전히 동일한 규칙으로 재계산해야
// DB에 실제 저장된 external_id와 일치한다(불일치하면 그 항목은 그냥 매칭되지 않아 건너뛰므로,
// 규칙이 달라져도 잘못된 매칭이 아니라 "복원 실패"로 안전하게 귀결된다).
export function buildUrlLookup(cultureEventItems, buildExternalId) {
  const lookup = new Map();
  for (const item of cultureEventItems) {
    const title = cleanText(item.TITLE);
    const startDate = item.BEGIN_DE;
    if (!item.URL && (!title || !startDate)) continue;
    const externalId = buildExternalId('GG_CULTURE_EVENT', item.URL || `${title}|${startDate}`);
    if (item.URL) lookup.set(externalId, item.URL);
  }
  return lookup;
}

// 상세 페이지 HTML에서 "장 소" 필드값을 추출한다. 못 찾으면 null(추측하지 않음).
export function extractVenueFromHtml(html) {
  const match = html.match(VENUE_FIELD_REGEX);
  if (!match) return null;
  const venue = cleanText(match[1]);
  return venue || null;
}

export async function scrapeVenueName(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`상세 페이지 조회 실패 (HTTP ${res.status}): ${url}`);
  const html = await res.text();
  return extractVenueFromHtml(html);
}

// 콤마로 여러 장소가 나열된 경우 첫 번째만 대표 장소로 지오코딩한다
// (gg-culture-events-adapter.mjs의 API2 처리와 동일한 정책 — national-park-ecotour-adapter.mjs 선례).
export async function geocodeVenueOrNull(venue) {
  const primary = venue.split(',')[0].trim();
  if (!primary) return null;
  const coords = await geocode(primary);
  if (!coords) return null;
  if (!isWithinGyeonggiBounds(coords)) return null;
  return { primary, coords };
}

export { GYEONGGI_BOUNDS };

// client: createAdminClient() 결과. dryRun이면 실제 UPDATE 없이 무엇을 할지만 로그로 남긴다.
export async function enrichGgCultureEventLocations({ client, adapter, dryRun = false }) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: targets, error } = await client
    .from('events')
    .select('id, external_id, title')
    .gte('end_date', today)
    .in('location_precision', ['CITY_APPROX', 'UNKNOWN']);
  if (error) throw new Error(error.message);

  const api1Targets = targets.filter((t) => t.external_id.startsWith(API1_EXTERNAL_ID_PREFIX));
  const otherTargets = targets.filter((t) => !t.external_id.startsWith(API1_EXTERNAL_ID_PREFIX));
  if (otherTargets.length > 0) {
    console.warn(
      `⚠️ API1(${API1_EXTERNAL_ID_PREFIX}) 외 출처 대상 ${otherTargets.length}건은 이 스크립트의 URL 복원 대상이 아니라 건너뜁니다.`
    );
  }

  console.log(
    `▶ 보완 대상: ${api1Targets.length}건 (end_date >= ${today}, location_precision IN CITY_APPROX/UNKNOWN, API1 소스)`
  );
  if (api1Targets.length === 0) {
    return { total: 0, updated: 0, noUrlRecovered: 0, noVenueField: 0, geocodeFailed: 0 };
  }

  const raw = await adapter.fetch();
  const urlByExternalId = buildUrlLookup(raw.cultureEventItems, adapter.buildExternalId.bind(adapter));

  let updated = 0;
  let noUrlRecovered = 0;
  let noVenueField = 0;
  let geocodeFailed = 0;

  for (const target of api1Targets) {
    const url = urlByExternalId.get(target.external_id);
    if (!url) {
      noUrlRecovered += 1;
      console.warn(`⚠️ [${target.title}] 원본 API에서 더 이상 찾을 수 없어 URL 복원 실패 — 건너뜀`);
      continue;
    }

    let venue;
    try {
      venue = await scrapeVenueName(url);
    } catch (err) {
      console.warn(`⚠️ [${target.title}] 상세 페이지 스크래핑 실패: ${err.message} — 건너뜀`);
      continue;
    }
    await sleep(FETCH_PACING_MS);

    if (!venue) {
      noVenueField += 1;
      console.warn(`⚠️ [${target.title}] 상세 페이지에서 "장소" 필드를 찾지 못함 — 건너뜀`);
      continue;
    }

    const geocoded = await geocodeVenueOrNull(venue);
    if (!geocoded) {
      geocodeFailed += 1;
      console.warn(`⚠️ [${target.title}] "${venue}" 지오코딩 실패 또는 경기도 범위 밖 — 건너뜀`);
      continue;
    }

    console.log(
      `✅ [${target.title}] "${venue}" → (${geocoded.coords.lng}, ${geocoded.coords.lat}) EXACT 승격${dryRun ? ' (dry-run)' : ''}`
    );

    if (!dryRun) {
      // venue_name은 스크래핑한 전체 원문(콤마 포함)을 그대로 저장한다 — geocoded.primary는
      // 지오코딩 질의에만 쓰는 대표 토큰이라, 이걸 venue_name에 쓰면 "3층" 같은 나머지 정보가
      // 잘려나간다(실측으로 발견한 버그: 표시용 값과 지오코딩용 값을 혼동하지 않도록 분리).
      const { error: updateError } = await client
        .from('events')
        .update({
          venue_name: venue,
          location: `SRID=4326;POINT(${geocoded.coords.lng} ${geocoded.coords.lat})`,
          location_precision: 'EXACT',
        })
        .eq('id', target.id);
      if (updateError) {
        console.warn(`⚠️ [${target.title}] DB 업데이트 실패: ${updateError.message}`);
        continue;
      }
    }
    updated += 1;
  }

  return { total: api1Targets.length, updated, noUrlRecovered, noVenueField, geocodeFailed };
}
