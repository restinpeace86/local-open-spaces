// GG_CULTURE_EVENTS: 경기데이터드림(data.gg.go.kr) 문화행사/공연 2개 API 통합 수집 (Task 9-6-1)
// API 1(GGCULTUREVENTSTUS): 경기도 문화 행사 현황. API 2(GGCULFOUEVENSTM): 경기문화재단 행사 프로그램.
// 기존 gg-events-adapter.mjs(GgEventsAdapter, source_type=GG_EVENTS)와는 이름만 비슷할 뿐 전혀
// 다른 데이터셋(그쪽은 공공 수영장/물놀이형 수경시설 → open_spaces)이라 별도 어댑터로 신설한다
// (기존 소스를 덮어쓰지 않음 — 제5장 제4조 기존 구조 우선).
//
// 실측 확인(2026-08-22, Task 9-6-1): 지시서에 명시된 필드명(SIGUN_NM, ADDR, INST_NAME)은 두 API
// 어디에도 존재하지 않았다 — 실제 호출로 확인한 진짜 필드는 아래와 같다.
// API1 실제 필드: INST_NM, TITLE, CATEGORY_NM(행사/공연/교육/전시 4종), URL, EVENT_TM_INFO,
//   PARTCPT_EXPN_INFO, TELNO_INFO, HOST_INST_NM, HMPG_URL, IMAGE_URL, BEGIN_DE, END_DE, WRITNG_DE.
//   **주소/시군구/위경도 필드가 전혀 없음**(20건 표본 전수 확인) — INST_NM/HOST_INST_NM은 주최
//   "기관명"이지 행사 장소가 아니라 지오코딩 근거로 쓸 수 없다(추측 금지).
//
// Task 9-6-2(2026-08-23, Decision 009): 사용자가 TITLE/HOST_INST_NM 텍스트에 경기도 시/군명이
// 일부 포함돼 있음을 직접 확인·제시하며 아래 방식 도입을 채팅으로 명시적으로 승인했다.
//   1) TITLE(우선) 또는 HOST_INST_NM에서 경기도 31개 시/군명이 매칭되면, 원본 좌표가 없어도
//      해당 시/군 중심좌표("경기도 {시/군}청" 지오코딩 결과, GYEONGGI_BOUNDS로 오매칭 방지)로
//      location_precision='CITY_APPROX'를 부여해 노출한다(정확한 행사장 위치가 아니라 시/군 단위
//      근사값이라는 한계가 있음 — 지도/주변 RPC에는 노출되지 않고 메인 피드에서만 노출됨).
//   2) 시/군명이 전혀 매칭되지 않으면 location=null, location_precision='UNKNOWN'으로 저장해
//      "경기도권 기타" 섹션에서만 노출한다(좌표를 지어내지 않음 — 추측 금지 원칙 유지).
//   동음이의어 오탐 방지: '화성'(행성 Mars), '구리'(금속), '이천'(숫자 2000), '오산'(오판/착오),
//   '여주'(채소), '광주'(경기도 밖 광주광역시)는 일반 명사/타 지역과 겹칠 위험이 있어 반드시
//   "시/군" 접미사가 붙은 전체 명칭으로만 매칭한다(예: "화성" 단독은 무시, "화성시"만 인정).
//   단 '광주'는 사용자가 실측으로 제시한 "경기 광주"(접미사 없는) 표기 패턴을 예외로 인정한다
//   ("경기"가 바로 앞에 붙은 경우만 — 광주광역시와 구분).
// API2 실제 필드: DIV_NM(안정적 숫자 ID), TITLE_NM, BGNG_NM/END_NM("YYYY-MM-DD HH:MM:SS"),
//   LOC_NM(장소/주소 텍스트 — 있음), TRGT_NM, MNGT_NM, LANG_NM, ORIGIN_CONT(URL), DTCONT(설명),
//   CLASS_NM(콤마 구분 태그), GOODS_NM, GOODS_DIV. LOC_NM은 형식이 제각각이라("경기도 안산시
//   경기도미술관"처럼 완전한 주소도 있고, "백남준아트센터 랜덤액세스홀"처럼 주소 없는 장소명만
//   있는 경우도, "경기아트센터, 경기 예술인의 집, ..."처럼 콤마로 여러 장소를 나열한 경우도 있음
//   — 30건 표본 실측 확인) national-park-ecotour-adapter.mjs와 동일하게 콤마로 나뉘면 첫 번째만
//   대표 장소로 지오코딩 시도하고, 실패하면(장소명뿐이라 VWorld가 주소로 인식 못 하는 경우 포함)
//   해당 건만 건너뛴다(좌표를 지어내지 않음). 실측 dry-run에서 추가로 발견: "삼남길 제6길
//   화성효행길, ..."처럼 도보 코스 구간명을 나열한 LOC_NM은 VWorld가 경기도와 무관한 다른
//   지역의 동명 도로로 잘못 매칭해 "성공"을 반환하는 경우가 있었다 — 이 소스는 경기도 전용이므로
//   반환 좌표가 경기도 대략 범위(GYEONGGI_BOUNDS)를 벗어나면 오매칭으로 간주해 건너뛴다.
//
// CATEGORY_NM(API1)은 1,000건 표본에서 4개 값만 확인됨(행사/공연/교육/전시) — 값이 고정적이라
// API2와 달리 AI 폴백 없이 고정 규칙표(API1_CATEGORY_MAP)로 직접 매핑한다.
// CLASS_NM(API2)은 자유 태그 나열이라(예: "경기도 예술인,예술인 기회소득,예술인 축제,경기도미술관")
// 규칙표를 만들 수 없어 seoul-culture-events.mjs와 동일한 AI 폴백(classifyEventTypeWithAI)을 쓴다.
//
// reservation_url: seoul-culture-events.mjs 선례를 따라 별도 예약 마감 개념이 없는 이 소스는
// reservationUrl을 채우지 않는다(버릴 정보가 아니라 기존 어댑터들의 일관된 처리 방식).
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildEventRow, extractSigunguName } from './lib/schema-mapper.mjs';
import { cleanText, classifyEventTypeWithAI, deriveBookingStatus, deriveParentalTags } from '../lib/ai-tagging.mjs';
import { geocode, hasVworldApiKey } from './lib/vworld-geocoder.mjs';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { settleGroupFetches } from '../lib/settle-group-fetches.mjs';
// [지오코딩 실/층 단위 정규화 누락 수정](2026-09-05 사용자 지시): "고고학체험실 같은건
// 정규화를 통해서 제거되고... 지오코딩으로 던져야 할텐데?" — 실측 확인 결과 API2
// (GGCULFOUEVENSTM) 최초 수집(transformFoundationEvents)은 gg-culture-location-
// enrichment.mjs(API1 보완 전용, 이 파일 아래에서 원본 좌표가 없는 경우에만 나중에
// 실행)와 별개의 코드 경로라 애초에 이 정규화를 한 번도 거치지 않았다 — LOC_NM 원문을
// ("전곡선사박물관 고고학체험실"/"백남준아트센터 내외부"처럼 실/층 단위가 붙은 그대로)
// 곧장 지오코딩에 던지고 있었다(진짜 버그, 아래 transformFoundationEvents 참고). 이미
// 검증된 정규화 함수(순수 문자열 함수, 부작용 없음)를 그대로 재사용한다 — 이 두 파일은
// 서로를 import하는 순환 참조가 되지만(gg-culture-location-enrichment.mjs도 이 파일의
// GYEONGGI_BOUNDS/isWithinGyeonggiBounds를 가져간다), 양쪽 다 모듈 최상단이 아니라
// 함수 본문 안에서만 참조해 실행 시점(두 모듈이 이미 전부 로드된 뒤)에는 문제가 없다
// (ESM 순환 참조의 잘 알려진 안전 패턴 — 실제로 테스트 스위트 통과로 재확인했다).
import { normalizeVenueText } from './gg-culture-location-enrichment.mjs';

const CULTURE_EVENT_BASE_URL = 'https://openapi.gg.go.kr/GGCULTUREVENTSTUS';
const FOUNDATION_EVENT_BASE_URL = 'https://openapi.gg.go.kr/GGCULFOUEVENSTM';
const PAGE_SIZE = 1000;
const SUCCESS_RESULT_CODE = 'INFO-000';
// Task 8-2(기존 gg-events-adapter.mjs)에서 실측 확인한 WAF 우회용 User-Agent를 동일하게 사용한다.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GEOCODE_PACING_MS = 250;
const GEOCODE_MAX_ATTEMPTS = 3;
const SOURCE = 'gg_public';

// 실측으로 발견한 버그(2026-08-22 dry-run): LOC_NM이 "삼남길 제6길 화성효행길, 평해길 제7길
// 지평향교길, ..."처럼 단일 장소가 아니라 도보 코스/구간 이름을 나열한 경우, VWorld가 그 문자열을
// 경기도와 무관한 다른 지역의 동명 도로로 잘못 매칭해(예: 울산/경주 인근 좌표, 129.2°E) "성공"
// 응답을 반환했다 — 결과가 없어서 스킵되는 정상 케이스와 달리 이건 틀린 좌표가 조용히 들어갈
// 뻔한 사례라 더 위험하다. 이 어댑터는 "경기데이터드림"(경기도 전용) 소스이므로, 반환된 좌표가
// 경기도 대략적 범위를 크게 벗어나면(여유 있게 잡은 바운딩 박스) 신뢰할 수 없는 매칭으로 보고
// 좌표를 지어내는 대신 건너뛴다.
// Task 9-6-3: enrich-gg-culture-event-locations.mjs(상세 페이지 스크래핑 지오코딩)에서도
// 동일한 오매칭 방지 로직이 필요해 export한다.
export const GYEONGGI_BOUNDS = { minLng: 126.0, maxLng: 128.0, minLat: 36.7, maxLat: 38.5 };

export function isWithinGyeonggiBounds({ lng, lat }) {
  return (
    lng >= GYEONGGI_BOUNDS.minLng &&
    lng <= GYEONGGI_BOUNDS.maxLng &&
    lat >= GYEONGGI_BOUNDS.minLat &&
    lat <= GYEONGGI_BOUNDS.maxLat
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 대한민국 공식 행정구역 명칭 그대로라 추측이 아니다(제3장 제5조와 무관, schema-mapper.mjs의
// METRO_CITY_SHORT_NAME과 동일한 성격의 고정 사실 표).
const GYEONGGI_SIGUN_NAMES = [
  '수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시', '안산시', '고양시',
  '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인시', '파주시',
  '이천시', '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군',
];

// 위 헤더 주석의 "동음이의어 오탐 방지" 설명 참고: 이 이름들은 "시/군" 접미사 없이는 매칭하지 않는다.
const SUFFIX_ONLY_SIGUN_NAMES = new Set(['화성시', '구리시', '이천시', '오산시', '여주시', '광주시']);

function matchGyeonggiSigunName(text) {
  if (!text) return null;

  // "경기 광주"/"경기광주"(접미사 없는 표기, 사용자가 실측으로 제시한 패턴)는 광주광역시와
  // 구분되는 경기도 광주시로 특별히 인정한다.
  if (/경기\s*광주/.test(text)) return '광주시';

  for (const name of GYEONGGI_SIGUN_NAMES) {
    if (text.includes(name)) return name;
  }

  for (const name of GYEONGGI_SIGUN_NAMES) {
    if (SUFFIX_ONLY_SIGUN_NAMES.has(name)) continue;
    const stem = name.replace(/(시|군)$/, '');
    if (stem && text.includes(stem)) return name;
  }

  return null;
}

// API1(GGCULTUREVENTSTUS)의 BEGIN_DE/END_DE는 "20260911"(YYYYMMDD, 구분자 없음) 형식이다
// (실측 확인) — events.start_date/end_date(DATE)에 맞게 "2026-09-11"로 변환한다.
function formatYyyymmdd(raw) {
  if (!raw || raw.length !== 8) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

// API1의 CATEGORY_NM은 1,000건 표본에서 4개 값만 확인됐다(위 헤더 주석 참고) — 고정 규칙표로 매핑.
const API1_CATEGORY_MAP = {
  공연: 'PERFORMANCE_FESTIVAL',
  전시: 'EXHIBITION_MUSEUM',
  교육: 'EXPERIENCE_CLASS',
  행사: 'PERFORMANCE_FESTIVAL',
};

export class GgCultureEventsAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'GG_CULTURE_EVENTS', targetTable: 'events', source: SOURCE });

    this.apiKey = process.env.GG_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('GG_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    if (!hasVworldApiKey()) {
      throw new Error(
        'VWORLD_API_KEY 환경변수가 설정되지 않았습니다. GGCULFOUEVENSTM(경기문화재단 행사 프로그램)의 LOC_NM 텍스트를 좌표로 바꾸려면 지오코딩이 필요합니다.'
      );
    }
    // GEMINI_API_KEY는 필수가 아니다 — classifyEventTypeWithAI가 미설정 시 ETC로 폴백하며
    // 경고만 남긴다(seoul-culture-events.mjs와 동일한 정책).
    this.geminiApiKey = process.env.GEMINI_API_KEY;

    // Task 9-6-2: 같은 시/군이 API1 여러 행에서 반복 매칭되므로, 시/군당 한 번만 지오코딩한다.
    this.cityCenterCache = new Map();
  }

  async fetchPage(baseUrl, rootKey, pIndex) {
    const params = new URLSearchParams({
      KEY: this.apiKey,
      Type: 'json',
      pIndex: String(pIndex),
      pSize: String(PAGE_SIZE),
    });

    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`GgCultureEvents(${rootKey}) 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GgCultureEvents(${rootKey}) 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const root = json[rootKey];
    if (!root) {
      throw new Error(`GgCultureEvents(${rootKey}) 응답에 루트 키가 없습니다: ${text.slice(0, 300)}`);
    }

    const head = root[0]?.head ?? [];
    const totalCount = head.find((h) => 'list_total_count' in h)?.list_total_count ?? 0;
    const result = head.find((h) => 'RESULT' in h)?.RESULT;

    if (result?.CODE !== SUCCESS_RESULT_CODE) {
      throw new Error(`GgCultureEvents(${rootKey}) 에러 응답: ${result?.CODE} ${result?.MESSAGE}`);
    }

    const items = root[1]?.row ?? [];
    return { items, totalCount };
  }

  async fetchAll(baseUrl, rootKey) {
    const items = [];
    let pIndex = 1;
    let totalCount = Infinity;

    while ((pIndex - 1) * PAGE_SIZE < totalCount) {
      const page = await this.fetchPage(baseUrl, rootKey, pIndex);
      totalCount = page.totalCount;
      items.push(...page.items);
      pIndex += 1;
    }

    return items;
  }

  // [외부 공공 API 배치 수집 안정성 및 독립 실행 구조 고도화](2026-09-01 사용자 지시)
  // 항목 1: 이 두 API(문화행사 API1/문화재단 행사 API2)는 완전히 독립된 서로 다른
  // 엔드포인트인데 Promise.all로 묶여 있어, 하나가 타임아웃 등으로 실패하면 이미
  // 성공했을 다른 하나까지 통째로 버려지고 있었다(실측 확인). settleGroupFetches로
  // 개별 격리 — 하나가 실패해도 다른 하나는 정상적으로 수집된다.
  async fetch() {
    const results = await settleGroupFetches(this.sourceKey, [
      { name: 'GGCULTUREVENTSTUS(문화행사)', run: () => this.fetchAll(CULTURE_EVENT_BASE_URL, 'GGCULTUREVENTSTUS') },
      { name: 'GGCULFOUEVENSTM(문화재단행사)', run: () => this.fetchAll(FOUNDATION_EVENT_BASE_URL, 'GGCULFOUEVENSTM') },
    ]);
    return {
      cultureEventItems: results['GGCULTUREVENTSTUS(문화행사)'] ?? [],
      foundationEventItems: results['GGCULFOUEVENSTM(문화재단행사)'] ?? [],
    };
  }

  // eslint-disable-next-line class-methods-use-this
  buildExternalId(prefix, key) {
    const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
    return `${prefix}_${hash}`;
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. fetch()가 { cultureEventItems,
  // foundationEventItems } 복합 객체를 반환하므로 두 배열을 합쳐 처리하고, transform()과 동일한
  // 키(URL/DIV_NM 우선, 없으면 제목+시작일)로 external_id와 1:1 대응하는 sourceId를 만든다.
  getRawRows({ cultureEventItems, foundationEventItems }) {
    const cultureRaw = cultureEventItems.map((item) => ({
      sourceId: this.buildExternalId('GG_CULTURE_EVENT', item.URL || `${item.TITLE}|${item.BEGIN_DE}`),
      payload: item,
    }));
    const foundationRaw = foundationEventItems.map((item) => ({
      sourceId: this.buildExternalId('GG_FOUNDATION_EVENT', item.DIV_NM || `${item.TITLE_NM}|${item.BGNG_NM}`),
      payload: item,
    }));
    return [...cultureRaw, ...foundationRaw];
  }

  async geocodeOrSkip(name, address) {
    for (let attempt = 1; attempt <= GEOCODE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const coords = await geocode(address);
        await sleep(GEOCODE_PACING_MS);

        if (!coords) {
          console.warn(`⚠️ 지오코딩 결과 없음 [${name}] "${address}" — 건너뜀`);
          return null;
        }
        if (!isWithinGyeonggiBounds(coords)) {
          console.warn(
            `⚠️ 지오코딩 결과가 경기도 범위를 벗어남 [${name}] "${address}" → (${coords.lng}, ${coords.lat}) — 잘못된 매칭으로 보고 건너뜀`
          );
          return null;
        }
        return coords;
      } catch (err) {
        if (attempt < GEOCODE_MAX_ATTEMPTS) {
          const backoffMs = GEOCODE_PACING_MS * 2 ** attempt;
          console.warn(
            `⚠️ 지오코딩 일시 실패 [${name}] "${address}" (시도 ${attempt}/${GEOCODE_MAX_ATTEMPTS}): ${err.message} — ${backoffMs}ms 후 재시도`
          );
          await sleep(backoffMs);
        } else {
          console.warn(`⚠️ 지오코딩 최종 실패 [${name}] "${address}": ${err.message}`);
          return null;
        }
      }
    }
    return null;
  }

  // Task 9-6-2: 시/군명이 매칭되면 그 시/군 중심좌표(근사)로 지오코딩, 캐시로 중복 호출 방지.
  // 실측 확인(2026-08-23): "경기도 {시/군}청"(시청/군청 건물명)으로 질의하면 수원시청·경기도청
  // 등 일부만 성공하고 하남시청/파주시청 등은 VWorld 주소 DB에 건물명으로 등록돼 있지 않아
  // NOT_FOUND였다. 반면 "청"을 뺀 행정구역명 자체("경기도 하남시" 등)는 31개 전부 성공했다 —
  // VWorld가 행정구역 경계의 대표 좌표를 반환하는 것으로 보이며, 오히려 "시/군 중심좌표
  // 근사"라는 의도에 더 부합한다(특정 건물이 아니라 그 지역 자체를 대표하는 좌표이므로).
  async geocodeCityCenterOrNull(sigunName) {
    if (this.cityCenterCache.has(sigunName)) return this.cityCenterCache.get(sigunName);
    const coords = await this.geocodeOrSkip(sigunName, `경기도 ${sigunName}`);
    this.cityCenterCache.set(sigunName, coords);
    return coords;
  }

  // API1(GGCULTUREVENTSTUS)은 원본에 주소/좌표 필드가 없다(위 헤더 주석 참고). TITLE/HOST_INST_NM
  // 텍스트에서 경기도 시/군명이 매칭되면 CITY_APPROX(시/군 중심좌표 근사)로, 매칭 안 되면
  // UNKNOWN(location=null, "경기도권 기타" 전용)으로 행을 만든다 — 어느 경우든 좌표를 지어내지
  // 않는다(추측 금지 원칙 유지).
  // Task 9-6-14(Decision 012) Graceful Parsing: 한 건에서 예기치 못한 오류(원본 API 필드 형식이
  // 표본 실측과 다른 극히 일부 행 등)가 나도 그 건만 로그로 남기고 건너뛴다 — 이미 알려진 케이스
  // (제목/날짜 누락, 지오코딩 실패)는 기존처럼 continue로 조용히 스킵하고, try/catch는 그 외의
  // 진짜 예외 상황(전체 배치를 중단시킬 뻔한 버그)에 대한 안전망이다.
  async transformCultureEvents(items) {
    const rows = [];

    for (const item of items) {
      try {
        const title = cleanText(item.TITLE);
        const startDate = formatYyyymmdd(item.BEGIN_DE);
        const endDate = formatYyyymmdd(item.END_DE);
        if (!title || !startDate || !endDate) continue;

        const matchedSigun = matchGyeonggiSigunName(title) ?? matchGyeonggiSigunName(item.HOST_INST_NM);
        const coords = matchedSigun ? await this.geocodeCityCenterOrNull(matchedSigun) : null;

        const uiCategory = API1_CATEGORY_MAP[item.CATEGORY_NM]
          ?? (await classifyEventTypeWithAI({ title, rawLabel: item.CATEGORY_NM, apiKey: this.geminiApiKey }));

        const row = buildEventRow({
          externalId: this.buildExternalId('GG_CULTURE_EVENT', item.URL || `${title}|${startDate}`),
          title,
          source: SOURCE,
          uiCategory,
          startDate,
          endDate,
          lng: coords?.lng,
          lat: coords?.lat,
          locationPrecision: coords ? 'CITY_APPROX' : 'UNKNOWN',
          thumbnailUrl: item.IMAGE_URL || null,
          venueName: item.INST_NM || null,
          // 좌표 지오코딩에 실패해도(coords===null) 매칭된 시/군명 자체는 알고 있으므로 남겨둔다
          // (좌표 없이도 "어느 시/군"인지는 표시 가능 — 추측이 아니라 이미 매칭된 사실).
          sigunguName: matchedSigun,
          // [수집기 본문(Contents) 필드 적재 보강](2026-08-26) 실측 확인: GGCULTUREVENTSTUS(API1,
          // 문화행사)에는 설명/본문 필드 자체가 원본에 없다(위 헤더 주석의 실제 필드 목록 참고,
          // 20건 표본 전수 확인 완료) — description은 null이 정확한 값이다(추측으로 다른 필드를
          // 억지로 끼워 넣지 않음). raw_data에는 그래도 원본 전체를 무손실 보존한다.
          rawData: item,
          description: null,
        });

        if (row) rows.push(row);
      } catch (err) {
        console.warn(`⚠️ [GGCULTUREVENTSTUS] 행 파싱 오류 [${item?.TITLE ?? '(제목 없음)'}]: ${err.message} — 건너뜀`);
      }
    }

    return rows;
  }

  async transformFoundationEvents(items) {
    const rows = [];

    for (const item of items) {
      try {
        const title = cleanText(item.TITLE_NM);
        const startDate = item.BGNG_NM?.slice(0, 10) ?? null;
        const endDate = item.END_NM?.slice(0, 10) ?? null;
        if (!title || !startDate || !endDate) continue;

        // 콤마로 여러 장소가 나열된 경우 첫 번째만 대표 장소로 지오코딩한다
        // (national-park-ecotour-adapter.mjs와 동일한 정책).
        const primaryLocation = item.LOC_NM?.split(',')[0]?.trim();
        if (!primaryLocation) continue;

        // [지오코딩 실/층 단위 정규화 누락 수정](2026-09-05 사용자 지시): 원문을 먼저
        // 그대로 시도한다(건물명+실 전체가 하나의 POI로 등록돼 카카오 키워드 검색이
        // 성공하는 경우도 실측으로 있었음 — gg-culture-location-enrichment.mjs와 동일한
        // "원문 우선, 실패 시 정규화 재시도" 순서를 그대로 따른다). 실패하면 "고고학체험실"/
        // "내외부"처럼 원문에 남아있던 실/층/홀 단위를 제거한 이름으로 한 번 더 시도한다.
        let coords = await this.geocodeOrSkip(title, primaryLocation);
        if (!coords) {
          const normalized = normalizeVenueText(primaryLocation);
          if (normalized) coords = await this.geocodeOrSkip(title, normalized);
        }
        if (!coords) continue;

        const tags = deriveParentalTags(JSON.stringify(item));
        const bookingStatus = deriveBookingStatus({
          isReservationRequired: false,
          reservationEndDate: null,
          startDate,
          endDate,
        });

        const row = buildEventRow({
          externalId: this.buildExternalId('GG_FOUNDATION_EVENT', item.DIV_NM || `${title}|${startDate}`),
          title,
          source: SOURCE,
          uiCategory: await classifyEventTypeWithAI({
            title,
            rawLabel: item.CLASS_NM,
            apiKey: this.geminiApiKey,
          }),
          startDate,
          endDate,
          lng: coords.lng,
          lat: coords.lat,
          thumbnailUrl: null, // 실측 확인: API2에는 이미지 필드가 없음
          bookingStatus,
          venueName: item.LOC_NM || null,
          sigunguName: extractSigunguName(primaryLocation),
          // [수집기 본문(Contents) 필드 적재 보강](2026-08-26): GGCULFOUEVENSTM(API2, 경기문화
          // 재단 행사)은 DTCONT(설명) 필드가 실제로 존재한다(위 헤더 주석 실측 확인). 다만
          // 값이 없을 때 "-"(하이픈) 플레이스홀더로 채워진 사례를 실측으로 확인해, 실질적인
          // 내용이 없는 이 값은 null로 정리한다(플레이스홀더를 실제 설명으로 오인하지 않도록).
          rawData: item,
          description: item.DTCONT && item.DTCONT.trim() && item.DTCONT.trim() !== '-' ? item.DTCONT.trim() : null,
          ...tags,
        });

        if (row) rows.push(row);
      } catch (err) {
        console.warn(`⚠️ [GGCULFOUEVENSTM] 행 파싱 오류 [${item?.TITLE_NM ?? '(제목 없음)'}]: ${err.message} — 건너뜀`);
      }
    }

    return rows;
  }

  async transform({ cultureEventItems, foundationEventItems }) {
    const [cultureRows, foundationRows] = await Promise.all([
      this.transformCultureEvents(cultureEventItems),
      this.transformFoundationEvents(foundationEventItems),
    ]);
    return [...cultureRows, ...foundationRows];
  }
}
