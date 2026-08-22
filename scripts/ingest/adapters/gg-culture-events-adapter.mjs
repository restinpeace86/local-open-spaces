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
//   "기관명"이지 행사 장소가 아니라 지오코딩 근거로 쓸 수 없다(추측 금지). 따라서 이 API의 행은
//   좌표를 만들어낼 방법이 없어 buildEventRow의 필수 필드 검증(lng/lat 없으면 null 반환)에 의해
//   전량 스킵된다 — 코드 결함이 아니라 원본 API 자체에 위치 정보가 없는 실측 확인된 한계다.
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
// CATEGORY_NM(API1)은 1,000건 표본에서 4개 값만 확인됨(행사/공연/교육/전시)을 참고로 남겨두나,
// API1은 위 이유로 어차피 행 자체가 만들어지지 않아 이 값을 실제로 분류에 쓰지는 않는다.
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

const CULTURE_EVENT_BASE_URL = 'https://openapi.gg.go.kr/GGCULTUREVENTSTUS';
const FOUNDATION_EVENT_BASE_URL = 'https://openapi.gg.go.kr/GGCULFOUEVENSTM';
const PAGE_SIZE = 1000;
const SUCCESS_RESULT_CODE = 'INFO-000';
// Task 8-2(기존 gg-events-adapter.mjs)에서 실측 확인한 WAF 우회용 User-Agent를 동일하게 사용한다.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GEOCODE_PACING_MS = 250;
const GEOCODE_MAX_ATTEMPTS = 3;

// 실측으로 발견한 버그(2026-08-22 dry-run): LOC_NM이 "삼남길 제6길 화성효행길, 평해길 제7길
// 지평향교길, ..."처럼 단일 장소가 아니라 도보 코스/구간 이름을 나열한 경우, VWorld가 그 문자열을
// 경기도와 무관한 다른 지역의 동명 도로로 잘못 매칭해(예: 울산/경주 인근 좌표, 129.2°E) "성공"
// 응답을 반환했다 — 결과가 없어서 스킵되는 정상 케이스와 달리 이건 틀린 좌표가 조용히 들어갈
// 뻔한 사례라 더 위험하다. 이 어댑터는 "경기데이터드림"(경기도 전용) 소스이므로, 반환된 좌표가
// 경기도 대략적 범위를 크게 벗어나면(여유 있게 잡은 바운딩 박스) 신뢰할 수 없는 매칭으로 보고
// 좌표를 지어내는 대신 건너뛴다.
const GYEONGGI_BOUNDS = { minLng: 126.0, maxLng: 128.0, minLat: 36.7, maxLat: 38.5 };

function isWithinGyeonggiBounds({ lng, lat }) {
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

export class GgCultureEventsAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'GG_CULTURE_EVENTS', targetTable: 'events' });

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
  }

  async fetchPage(baseUrl, rootKey, pIndex) {
    const params = new URLSearchParams({
      KEY: this.apiKey,
      Type: 'json',
      pIndex: String(pIndex),
      pSize: String(PAGE_SIZE),
    });

    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
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

  async fetch() {
    const [cultureEventItems, foundationEventItems] = await Promise.all([
      this.fetchAll(CULTURE_EVENT_BASE_URL, 'GGCULTUREVENTSTUS'),
      this.fetchAll(FOUNDATION_EVENT_BASE_URL, 'GGCULFOUEVENSTM'),
    ]);
    return { cultureEventItems, foundationEventItems };
  }

  // eslint-disable-next-line class-methods-use-this
  buildExternalId(prefix, key) {
    const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
    return `${prefix}_${hash}`;
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

  // API1(GGCULTUREVENTSTUS)은 주소/좌표 필드가 원본에 없어(위 헤더 주석 참고) 지오코딩 자체를
  // 시도하지 않는다 — buildEventRow가 lng/lat 없이는 null을 반환하므로 항상 스킵되지만, 그래도
  // 명시적으로 한 번만 경고를 남기고 개별 행마다 반복 경고하지 않는다(3,000여 건 로그 스팸 방지).
  async transformCultureEvents(items) {
    if (items.length > 0) {
      console.warn(
        `⚠️ GGCULTUREVENTSTUS(경기도 문화 행사 현황) ${items.length}건은 원본에 주소/좌표 필드가 없어 전량 스킵합니다(실측 확인된 API 한계 — 추측 좌표 생성 안 함).`
      );
    }
    return [];
  }

  async transformFoundationEvents(items) {
    const rows = [];

    for (const item of items) {
      const title = cleanText(item.TITLE_NM);
      const startDate = item.BGNG_NM?.slice(0, 10) ?? null;
      const endDate = item.END_NM?.slice(0, 10) ?? null;
      if (!title || !startDate || !endDate) continue;

      // 콤마로 여러 장소가 나열된 경우 첫 번째만 대표 장소로 지오코딩한다
      // (national-park-ecotour-adapter.mjs와 동일한 정책).
      const primaryLocation = item.LOC_NM?.split(',')[0]?.trim();
      if (!primaryLocation) continue;

      const coords = await this.geocodeOrSkip(title, primaryLocation);
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
        ...tags,
      });

      if (row) rows.push(row);
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
