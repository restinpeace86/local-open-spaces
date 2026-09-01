// CULTURAL_FACILITY_SUMMARY: 한국문화정보원_전국문화기반시설총람 정보 조회서비스
// (data.go.kr, B553457/rgnCltrFcltExmnv1). 박물관/미술관/공공도서관/생활문화센터/문화의집/
// 문학관/문예회관/국립도서관 8개 시설유형 통계 원부를 수집한다.
// 원본은 연간 통계조사 원부라 좌표 필드가 없어 Vworld 지오코딩으로 주소 → 좌표 변환이 필수다
// (VWORLD_API_KEY 부재 시 transform()이 명시적으로 경고를 출력하고 빈 배열을 반환해 스킵한다).
// spec/data/ai-rule.md 3.1 CULTURE(도서관/미술관/박물관/문화회관 등) → 3.3 매핑 기준으로
// 8개 유형 전부를 UI_CATEGORY.EXHIBITION_MUSEUM으로 매핑한다(문서에 더 세분화된 기준이 없어
// 임의로 쪼개지 않음 — CLAUDE.md 제3장 제4조 추측 금지).
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { geocode, hasVworldApiKey } from './lib/vworld-geocoder.mjs';
import { deriveParentalTags } from '../lib/ai-tagging.mjs';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { settleGroupFetches } from '../lib/settle-group-fetches.mjs';

const BASE_URL = 'https://apis.data.go.kr/B553457/rgnCltrFcltExmnv1';
const PAGE_SIZE = 100;
const YEAR_FALLBACK_CANDIDATES = [2024, 2023, 2022];
const SOURCE = 'cultural_facility_summary';

// 8개 수집 대상 엔드포인트 (지방문화원/지역문화재단 2종은 행정/법인 사무소 성격으로 제외 —
// implementation/todo.md Task 1 범위 정의 기준).
const ENDPOINTS = [
  { typeKey: 'MSM', path: 'clifMsmv1', nameField: 'msmNm', addressField: 'instAddr' },
  { typeKey: 'ARGL', path: 'clifArglv1', nameField: 'arglNm', addressField: 'instAddr' },
  { typeKey: 'LBRRY', path: 'clifLbrryv1', nameField: 'lbrryNm', addressField: 'instAddr' },
  { typeKey: 'LVCLCNTR', path: 'clifLvclCntrv1', nameField: 'lvclCntrNm', addressField: 'instAddr' },
  { typeKey: 'CLHS', path: 'clifClhsv1', nameField: 'clhsNm', addressField: 'instAddr' },
  { typeKey: 'LTRM', path: 'clifLtrm1', nameField: 'ltrmNm', addressField: 'addr' },
  { typeKey: 'CLCN', path: 'clifClcnv1', nameField: 'clcnNm', addressField: 'instAddr' },
  { typeKey: 'NTNLBRRY', path: 'clifNtnLbrryv1', nameField: 'lbrryNm', addressField: 'instAddr' },
];

export class CulturalFacilitySummaryAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'CULTURAL_FACILITY_SUMMARY', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  async fetchPage(endpointPath, pblshYr, pageNo) {
    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      resultType: 'JSON',
      pblshYr: String(pblshYr),
    });

    const url = `${BASE_URL}/${endpointPath}?${params.toString()}`;
    const res = await fetchWithTimeout(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`${endpointPath} 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${endpointPath} 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const header = json.response?.header;
    if (header?.resultCode !== '00') {
      throw new Error(`${endpointPath} 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const body = json.response?.body;
    return {
      items: body?.data ?? [],
      totalCount: Number(body?.totalCount ?? 0),
    };
  }

  // pblshYr을 최근 연도부터 순차 차감하며 데이터가 존재하는(totalCount > 0) 첫 연도를 찾는다.
  async resolvePblshYr(endpointPath) {
    for (const year of YEAR_FALLBACK_CANDIDATES) {
      const { totalCount } = await this.fetchPage(endpointPath, year, 1);
      if (totalCount > 0) return year;
    }
    return null;
  }

  async fetchEndpoint(endpoint) {
    const year = await this.resolvePblshYr(endpoint.path);
    if (!year) {
      console.warn(`⚠️ [${endpoint.path}] ${YEAR_FALLBACK_CANDIDATES.join('/')}년 모두 데이터 없음 — 스킵`);
      return [];
    }

    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while ((pageNo - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchPage(endpoint.path, year, pageNo);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageNo += 1;
    }

    console.log(`  [${endpoint.path}] pblshYr=${year} 기준 ${items.length}건 수신`);
    return items.map((item) => ({ endpoint, item }));
  }

  // [외부 공공 API 배치 수집 안정성 및 독립 실행 구조 고도화](2026-09-01 사용자 지시)
  // 항목 1: 8개 시설유형이 각자 완전히 독립된 API 엔드포인트인데 Promise.all로 묶여
  // 있어, 하나(예: 문예회관)가 타임아웃 등으로 실패하면 이미 성공한 나머지 7개까지
  // 전부 버려지고 있었다(실측 확인) — 이 어댑터가 사용자가 예시로 든 "그룹 루프"에
  // 가장 정확히 들어맞는 사례다. settleGroupFetches로 개별 격리한다.
  async fetch() {
    const results = await settleGroupFetches(
      this.sourceKey,
      ENDPOINTS.map((endpoint) => ({ name: endpoint.path, run: () => this.fetchEndpoint(endpoint) }))
    );
    return ENDPOINTS.flatMap((endpoint) => results[endpoint.path] ?? []);
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. fetch()가 { endpoint, item } 쌍 배열을
  // 반환하므로, external_id 구성과 동일하게 endpoint.typeKey + instId로 8개 시설유형 간
  // 충돌 없는 sourceId를 만든다. payload는 원본 item만 보존한다(endpoint는 라우팅 메타일 뿐).
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems
      .filter(({ item }) => item.instId)
      .map(({ endpoint, item }) => ({ sourceId: `${endpoint.typeKey}_${item.instId}`, payload: item }));
  }

  // 지오코딩은 비동기 네트워크 호출이라 base의 동기 transform()과 별도로 오버라이드한다.
  async transform(rawItems) {
    if (!hasVworldApiKey()) {
      console.warn(
        '⚠️ VWORLD_API_KEY 환경변수가 설정되지 않았습니다. 전국문화기반시설총람 원본에는 좌표가 없어 ' +
          'Vworld 지오코딩이 필수입니다. Vworld 오픈API(www.vworld.kr) 신청 후 .env.local에 VWORLD_API_KEY를 ' +
          '추가하세요. 이번 실행은 전체 스킵합니다.'
      );
      return [];
    }

    const rows = [];

    for (const { endpoint, item } of rawItems) {
      const name = item[endpoint.nameField];
      const address = item[endpoint.addressField];
      const instId = item.instId;

      if (!name || !address || !instId) continue;

      let coords = null;
      try {
        coords = await geocode(address);
      } catch (err) {
        console.warn(`⚠️ 지오코딩 실패 [${endpoint.path}] "${name}" (${address}): ${err.message}`);
        continue;
      }

      if (!coords) {
        console.warn(`⚠️ 지오코딩 결과 없음 [${endpoint.path}] "${name}" (${address}) — 건너뜀`);
        continue;
      }

      // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트를 근거로만 태깅한다.
      const tags = deriveParentalTags(JSON.stringify(item));

      const row = buildOpenSpaceRow({
        externalId: `CULTURAL_FACILITY_SUMMARY_${endpoint.typeKey}_${instId}`,
        sourceType: 'CULTURAL_FACILITY_SUMMARY',
        source: SOURCE,
        name,
        uiCategory: UI_CATEGORY.EXHIBITION_MUSEUM,
        address,
        lng: coords.lng,
        lat: coords.lat,
        // 통계조사 원부에는 요금 안내 텍스트가 없어 임의 추정하지 않음(추측 금지).
        isFree: null,
        infoUrl: item.hmpgAddr || null,
        facilityType: tags.facility_type,
        isKidsFriendly: tags.is_kids_friendly,
        hasParking: tags.has_parking,
        strollerAccessible: tags.stroller_accessible,
        targetAgeGroup: tags.target_age_group,
        rawData: item,
      });

      if (row) rows.push(row);
    }

    return rows;
  }
}
