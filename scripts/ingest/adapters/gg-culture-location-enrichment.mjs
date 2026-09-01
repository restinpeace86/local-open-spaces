// Task 9-6-3(2026-08-23): 활성/미래(end_date >= 오늘) 이벤트 중 location_precision이
// 'CITY_APPROX'/'UNKNOWN'인 행을 상세 페이지 스크래핑 + 지오코딩으로 보완해 'EXACT'로 승격한다.
//
// 실측 확인(2026-08-23): 이 조건에 해당하는 49건 전부 API1(GG_CULTURE_EVENT_ 접두어,
// ggc.ggcf.kr) 소스였다. API2(GG_FOUNDATION_EVENT_)는 수집 시점에 LOC_NM을 이미 직접
// 지오코딩해서, 실패하면 애초에 행 자체를 만들지 않는다(gg-culture-events-adapter.mjs
// transformFoundationEvents 참고) — 그래서 API2발 CITY_APPROX/UNKNOWN은 구조적으로 존재하지
// 않는다(실측으로 0건 확인). 따라서 이 보완 스크립트는 API1 소스만 다룬다.
//
// 지시서는 "네이버/카카오 지오코딩 API"를 언급했으나, 애초 이 프로젝트에는 서버사이드로 쓸 수
// 있는 키가 없었다 — 실제 호출로 확인함(2026-08-23):
//   - NEXT_PUBLIC_KAKAO_MAP_API_KEY는 카카오맵 JS SDK 전용 키(브라우저 도메인 제한)라
//     dapi.kakao.com/v2/local/search/address.json에 직접 요청하면 401
//     "KA Header is required but neither os nor origin field is given"로 거부된다.
//   - 네이버(NAVER_CLIENT_ID/SECRET 등)는 .env.local에 아예 설정돼 있지 않다.
// 그래서 당시엔 VWorld 지오코더(vworld-geocoder.mjs, 도로명/지번 주소 전용)만으로 처리했고,
// "OO아트센터 1층 전시실"류 시설명/건물명 단독 텍스트(VWorld가 주소로 인식 못 함)는 스킵됐다.
//
// Task 9-6-5(2026-08-23): 사용자가 KAKAO_REST_API_KEY(REST API 전용 키, JS SDK 키와 다름)를
// 새로 발급해 .env.local에 추가함 — 실제 호출로 정상 동작 확인(HTTP 200). 카카오 로컬
// "키워드 장소 검색"(주소가 아니라 등록된 장소/POI명으로 검색 가능)을 VWorld 실패 시 2차
// 폴백으로 추가한다(kakao-geocoder.mjs) — VWorld가 여전히 1차(이미 검증된 기존 경로 우선,
// 제5장 제4조), 실패하면 카카오로 재시도.
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
import { geocodeKeyword, hasKakaoApiKey } from './lib/kakao-geocoder.mjs';
import { GYEONGGI_BOUNDS, isWithinGyeonggiBounds } from './gg-culture-events-adapter.mjs';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';

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
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`상세 페이지 조회 실패 (HTTP ${res.status}): ${url}`);
  const html = await res.text();
  return extractVenueFromHtml(html);
}

// Task 9-6-6(2026-08-23): "OO아트센터 제2전시실"/"OO박물관 2층 교육실"처럼 건물명 뒤에 건물
// 내부 특정 실/층 단위가 붙은 텍스트는 VWorld/카카오 둘 다 통째로는 찾지 못하는 경우가 많다
// (건물 자체는 등록된 장소라도 그 안의 특정 전시실/교육실까지 POI로 등록돼 있지는 않음) —
// 사용자 지시대로 뒷부분의 실/층 단위를 제외한 "건물명"만 남겨 재시도한다.
// 실측(2026-08-23)으로 확인한 접미어 토큰 목록: 전시실/전시장/교육실/다목적홀/기획전시실/
// 소극장/소공연장/공연장/강당/아트홀/세미나실/멀티벙커/음악감상실/로비/갤러리/정원/어울림터/
// 내외부, 그리고 "홀"/"실"/"장"으로 끝나는 일반 명사(예: "맹사성홀", "전시장"). 순수 숫자·범위
// 토큰("1-4", "2,3")과 층수 표기("2층", "1F", "B1")도 함께 제거 대상이다. 토큰 단위로(부분
// 문자열이 아니라 공백으로 나눈 전체 단어 단위로) 뒤에서부터 하나씩 제거해, "맹사성홀"처럼
// 방 이름 전체가 하나의 단어인 경우도 그 단어 전체가 사라지게 한다(부분 문자열만 잘라내면
// "맹사성"처럼 애매한 잔재가 남아 오히려 지오코딩이 더 안 될 수 있음 — 실측으로 발견).
// "공원"처럼 그 자체로 유효한 장소명일 수 있는 단어는 목록에서 제외했다(추측 금지 — 실제로
// 건물 내부 단위인 것만 제거 대상으로 삼는다).
const ROOM_FLOOR_SUFFIX_WORDS = [
  '전시실', '전시장', '교육실', '다목적홀', '기획전시실', '소극장', '소공연장', '공연장',
  '강당', '아트홀', '세미나실', '멀티벙커', '음악감상실', '로비', '갤러리', '정원',
  '어울림터', '내외부', '홀', '실', '장',
];

function isRoomFloorTrailingToken(token) {
  const bare = token.replace(/[()]/g, '');
  if (/^\d+([-,]\d+)*$/.test(bare)) return true; // "1-4", "2,3" 등 순수 숫자/범위
  if (/^제?\d*(층|[fF])$/.test(bare)) return true; // "1층", "1F"
  if (/^[bB]\d{0,2}$/.test(bare)) return true; // "B1", "B" 등
  return ROOM_FLOOR_SUFFIX_WORDS.some((w) => bare.endsWith(w));
}

function isLeadingFloorToken(token) {
  return /^\(?[bB]?\d+[fF]\)?$/.test(token.replace(/[()]/g, ''));
}

// 못 찾으면 null(추측하지 않음 — 제거할 실/층 단위 토큰이 하나도 없으면 아예 시도하지 않는다).
export function stripRoomFloorDescriptor(text) {
  let tokens = text.trim().split(/\s+/);
  const originalLength = tokens.length;

  while (tokens.length > 1 && isLeadingFloorToken(tokens[0])) {
    tokens = tokens.slice(1);
  }

  let end = tokens.length;
  while (end > 1 && isRoomFloorTrailingToken(tokens[end - 1])) {
    end -= 1;
  }
  tokens = tokens.slice(0, end);

  if (tokens.length === originalLength) return null;
  const stripped = tokens.join(' ').replace(/[,\-]+$/, '').trim();
  return stripped || null;
}

// Task 9-6-6(2026-08-23) Part 2: "A 및 B" 형태로 서로 다른 장소 두 곳이 나열된 텍스트에서
// 앞쪽 대표 장소만 남긴다(콤마 나열 시 첫 번째만 대표로 삼는 기존 정책과 동일한 이유 —
// 지오코딩 결과가 어느 장소를 가리키는지 모호해지지 않도록). "및"이 맨 앞 토큰이면(대표로
// 삼을 앞부분이 없음) 시도하지 않는다.
// 예: "과천시민광장 및 과천시민회관 일대" → "과천시민광장", "양평군 세미원 및 두물머리" → "양평군 세미원"
export function truncateAtAndKeyword(text) {
  const tokens = text.trim().split(/\s+/);
  const idx = tokens.indexOf('및');
  if (idx <= 0) return null;
  const truncated = tokens.slice(0, idx).join(' ').trim();
  return truncated || null;
}

// Task 9-6-6 Part 2: 4단계 파이프라인의 "토큰 정규화 정제" 단계 — ① '및' 이하 절단을 먼저
// 적용해 대표 장소를 골라낸 뒤, ② 그 결과에 남아있을 수 있는 실/층/홀 단위를 제거한다.
// 두 규칙 모두 적용 대상이 없으면 null(추측하지 않음 — 원문을 억지로 바꾸지 않는다).
export function normalizeVenueText(text) {
  const truncated = truncateAtAndKeyword(text) ?? text;
  const stripped = stripRoomFloorDescriptor(truncated);
  if (stripped) return stripped;
  return truncated !== text ? truncated : null;
}

// Task 9-6-6(2026-08-23) Part 2: 4단계 표준 지오코딩 파이프라인 — 성공하는 단계에서 즉시
// break(반환)하고, 4단계까지 전부 실패하면 좌표를 지어내지 않고 null을 반환한다(호출부가 이를
// "실패"로 처리해 location_precision을 UNKNOWN/CITY_APPROX 상태 그대로 둔다 — 추측 금지).
//   1단계: VWorld 도로명/지번 지오코딩 (tryQuery 내부 1차 시도)
//   2단계: Kakao REST API 키워드/장소 검색 (tryQuery 내부 2차 시도, Task 9-6-5)
//   3단계: 상세 URL HTML 크롤링('장 소' 필드 추출) → 위 1·2단계 재시도
//     ※ 이 스크립트가 다루는 API1(GG_CULTURE_EVENT_) 소스는 애초에 원본 API 응답 자체에
//       장소 텍스트가 없어(주석 상단 설명 참고) 크롤링이 "지오코딩용 텍스트를 얻는 유일한
//       방법"이다 — 그래서 enrichGgCultureEventLocations()가 scrapeVenueName()으로 먼저
//       venue 텍스트를 확보한 뒤에야 이 함수(geocodeVenueOrNull)가 호출된다(1·2단계가
//       "크롤링 이후"에 오는 것이 아니라 크롤링한 결과에 대해 1·2단계를 적용하는 구조).
//   4단계: 토큰 정규화 정제(normalizeVenueText — '및' 이하 절단 + 실/층/홀 단위 제거) →
//     위 1·2단계로 재시도
// 콤마로 여러 장소가 나열된 경우 첫 번째만 대표 장소로 지오코딩한다(gg-culture-events-adapter.mjs의
// API2 처리와 동일한 정책 — national-park-ecotour-adapter.mjs 선례). 모든 시도가 동일하게
// 경기도 범위 검증을 거친다(이 소스는 경기도 전용이므로).
export async function geocodeVenueOrNull(venue) {
  const primary = venue.split(',')[0].trim();
  if (!primary) return null;

  const tryQuery = async (query) => {
    const vworldCoords = await geocode(query);
    if (vworldCoords && isWithinGyeonggiBounds(vworldCoords)) {
      return { coords: vworldCoords, provider: 'vworld' };
    }
    if (hasKakaoApiKey()) {
      const kakaoResult = await geocodeKeyword(query);
      if (kakaoResult && isWithinGyeonggiBounds(kakaoResult)) {
        return { coords: kakaoResult, provider: 'kakao' };
      }
    }
    return null;
  };

  const direct = await tryQuery(primary);
  if (direct) return { primary, ...direct };

  const normalized = normalizeVenueText(primary);
  if (normalized) {
    const normalizedResult = await tryQuery(normalized);
    if (normalizedResult) return { primary: normalized, ...normalizedResult };
  }

  return null;
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

    // geocoded.primary가 venue와 다르면(콤마 분리 또는 Task 9-6-6 실/층 단위 제거로 재시도해
    // 성공한 경우) 실제로 검색에 쓴 문자열을 함께 남겨 어떤 시도가 통했는지 알 수 있게 한다.
    const queryNote = geocoded.primary !== venue ? ` (검색어: "${geocoded.primary}")` : '';
    console.log(
      `✅ [${target.title}] "${venue}"${queryNote} → (${geocoded.coords.lng}, ${geocoded.coords.lat}) [${geocoded.provider}] EXACT 승격${dryRun ? ' (dry-run)' : ''}`
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
