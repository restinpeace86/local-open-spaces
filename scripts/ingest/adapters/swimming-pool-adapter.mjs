// SWIMMING_POOL: 전국 수영장(공공+민간 인허가) 통합 수집 (Task 7-3)
// API 1(체육진흥공단 SFMS_FACI, B551014): 공공/구립 체육시설 중 ftype_nm=수영장 필터링 조회.
// API 2(행정안전부 수영장업 인허가, 1741000/swimming_pools/info): 민간 인허가 수영장(키즈풀 포함) 조회.
//
// 인증키: 두 API 모두 PUBLIC_DATA_API_KEY(디코딩 키)를 encodeURIComponent로 재인코딩하는 방식으로
// 실제 호출에 성공함을 확인했다(2026-08-21). 웹에 기재된 인코딩 키를 인코딩 없이 그대로 붙이는
// 방식도 동일하게 동작하지만(둘 다 최종 바이트가 같음), 기존 어댑터 전체가 써온 재인코딩 방식과
// 통일해 이 방식만 사용한다 — 별도 폴백 코드가 필요하지 않음을 실측으로 확인했다.
//
// 응답 봉투/성공 코드가 두 API가 서로 다름을 실제 호출로 확인했다:
// - API1(B551014): response.header.resultCode === '00' ("NORMAL SERVICE")
// - API2(1741000): response.header.resultCode === '0' ("정상") — playground-adapter 등 기존
//   1741000 계열 어댑터는 '00'을 성공 코드로 썼으나, swimming_pools/info는 실측 결과 '0' 한 자리다.
//
// 좌표계: API1(faci_lat/faci_lot)은 실측 결과 이미 WGS84 십진 위경도다(표본: 경기 이천시
// faci_lat=37.236.../faci_lot=127.411... → 실제 위치와 일치). API2(CRD_INFO_X/CRD_INFO_Y)는
// EPSG:5174(Bessel TM)임을 실측으로 확인했다(표본: 경기 용인시 처인구 이동읍, X=218409.37/
// Y=409998.13 → convertEpsg5174ToWgs84 변환 결과 lng=127.205/lat=37.191로 실제 위치와 일치) —
// 기존 LocalDataKidsAdapter가 쓰는 것과 동일한 epsg5174.mjs 유틸을 재사용한다.
//
// 운영 상태 필터: API1은 faci_stat_nm==='정상운영'만, API2는 SALS_STTS_NM==='영업/정상'만 유효
// 처리한다(둘 다 실측으로 '폐업' 값이 섞여 있음을 확인).
//
// facility_type: Task 지시서 원문은 "facility_type = '수영장'"이라고 적혀 있으나, 이는
// spec/space/space-card.md의 실내/야외 뱃지 규약 및 schema-mapper.mjs의 normalizeFacilityType이
// 정의하는 도메인('실내'|'야외'|'복합')과 다른 값이라 그대로 대입하면 정규화 과정에서 조용히
// '복합'으로 치환될 뿐 실제로 반영되지 않는다. 대신 API1의 실제 필드 inout_gbn_nm(실내/실외/
// 실내외/없음)을 기존 어댑터들과 동일한 패턴(playground-adapter의 idrodrCdNm 매핑과 동일)으로
// 정직하게 매핑한다. API2에는 실내/실외 필드가 없어 기본값(복합)을 그대로 둔다(추측 금지).
//
// is_free: 요금 필드가 원본에 없으나, 운영주체 필드가 레코드별로 실제 내려온다 — API1은
// faci_gb_nm('공공'/그 외), API2는 PBP_SE_NM('공립'/'사립'). ai-rule.md 5.2-7 예외를 레코드
// 단위로 적용하는 deriveIsFreeFallback(playground-adapter와 동일 함수)을 그대로 재사용한다.
//
// is_kids_friendly: 두 API 모두 "키즈 전용" 여부를 직접 나타내는 별도 필드는 없지만(수영장은
// 어린이놀이시설과 달리 소스 전체가 정의상 아동 전용이라고 단정할 수 없음 — 성인 강습/자유수영
// 등 일반 대상 시설이 대부분), 시설명 텍스트에 아동 대상임을 명시하는 키워드가 실제로 포함되는
// 경우가 있어(예: 실측 확인된 API1 "이천스포츠센터실내 수영장"과 달리 다른 레코드들 중 "OO키즈
// 수영장"류 표기 존재) 사용자가 지정한 키워드 목록으로 레코드별 매칭한다(2026-08-21 정밀화).
// 키워드: 어린이/유아/키즈/영유아/유아풀/어린이풀/키즈풀 — 매칭되면 true, 없으면 기존대로 false.
// "상세설명" 필드는 두 API 어디에도 존재하지 않음을 실측으로 확인했다(API1은 faci_nm 외 텍스트
// 필드 없음, API2도 BPLC_NM 외 텍스트 필드 없음) — 있지도 않은 필드를 매칭 대상으로 넣지 않고
// 실제 존재하는 시설명/사업장명 필드에만 키워드 매칭을 적용한다(추측 금지, 존재하는 데이터만 사용).
//
// 중복 식별: Task 지시서 지시대로 "시설명+주소" 기준으로 병합한다. 두 API가 서로 다른 ID
// 네임스페이스를 쓰기 때문에(faci_cd vs MNG_NO) ID로는 겹침을 판별할 수 없다. 이름/주소 공백을
// 제거해 정규화한 키로 비교하며, 겹치는 경우 공공 데이터(API1)를 우선하고 API2 쪽은 건너뛴다.
// 이 방식은 완전히 동일한 표기(공백 차이만 허용)일 때만 중복으로 잡아내는 보수적 MVP 수준
// 로직이며, 도로명/지번 표기가 달라 겹치지 않는 경우까지는 잡아내지 못한다는 한계가 있다.
//
// external_id(API2): MNG_NO를 그대로 쓰면 실제 upsert가 "ON CONFLICT DO UPDATE command cannot
// affect row a second time"로 실패함을 실측으로 확인했다 — MNG_NO는 전국 유일 키가 아니라 발급
// 지자체별로 자체 채번되는 값이라 서로 다른 시설이 같은 값을 공유한다(실측 사례: 'CDFH33010120
// 26000001'이 인천 계양구 "스윔박스"부터 강원 정선군 "블루스카이풀"까지 37건의 전혀 다른 시설에
// 중복됨). LocalDataKidsAdapter/NationalParkEcotourAdapter가 이미 겪은 것과 동일한 유형의 소스
// ID 불안정 문제라, 동일한 해법(이름|주소 SHA1 해시)을 재사용해 external_id를 결정적으로 만든다.
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { deriveIsFreeFallback, matchesKidsKeyword } from '../lib/ai-tagging.mjs';
import { convertEpsg5174ToWgs84 } from './lib/epsg5174.mjs';

// 하위 호환: 이전에는 이 파일에 matchesKidsKeyword가 직접 정의돼 있었으나, gg-events-adapter.mjs
// (Task 8-2)도 동일 키워드 목록이 필요해져 lib/ai-tagging.mjs로 옮겨 공용화했다(2026-08-21).
export { matchesKidsKeyword };

const API1_BASE_URL = 'https://apis.data.go.kr/B551014/SRVC_API_SFMS_FACI/TODZ_API_SFMS_FACI';
const API2_BASE_URL = 'https://apis.data.go.kr/1741000/swimming_pools/info';
const PAGE_SIZE = 100;
const API1_SUCCESS_RESULT_CODE = '00';
const API2_SUCCESS_RESULT_CODE = '0';
const API1_ACTIVE_STATUS = '정상운영';
const API2_ACTIVE_STATUS = '영업/정상';
const SOURCE = 'swimming_pool';

export function normalizeForDedup(value) {
  return (value || '').replace(/\s+/g, '');
}

export function buildDedupKey(name, address) {
  return `${normalizeForDedup(name)}|${normalizeForDedup(address)}`;
}

export class SwimmingPoolAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SWIMMING_POOL', targetTable: 'open_spaces' });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  async fetchApi1Page(pageNo) {
    const params = new URLSearchParams({
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      resultType: 'json',
      ftype_nm: '수영장',
    });

    const url = `${API1_BASE_URL}?serviceKey=${encodeURIComponent(this.apiKey)}&${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`SwimmingPool API1 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`SwimmingPool API1 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const header = json.response?.header;
    if (header?.resultCode !== API1_SUCCESS_RESULT_CODE) {
      throw new Error(`SwimmingPool API1 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const items = json.response?.body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: Number(json.response?.body?.totalCount ?? 0),
    };
  }

  async fetchApi1() {
    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while ((pageNo - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchApi1Page(pageNo);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageNo += 1;
    }

    return items;
  }

  async fetchApi2Page(pageNo) {
    const params = new URLSearchParams({
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      returnType: 'json',
    });

    const url = `${API2_BASE_URL}?serviceKey=${encodeURIComponent(this.apiKey)}&${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`SwimmingPool API2 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`SwimmingPool API2 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const header = json.response?.header;
    if (header?.resultCode !== API2_SUCCESS_RESULT_CODE) {
      throw new Error(`SwimmingPool API2 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const items = json.response?.body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: Number(json.response?.body?.totalCount ?? 0),
    };
  }

  async fetchApi2() {
    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while ((pageNo - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchApi2Page(pageNo);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageNo += 1;
    }

    return items;
  }

  async fetch() {
    const [api1Items, api2Items] = await Promise.all([this.fetchApi1(), this.fetchApi2()]);
    return { api1Items, api2Items };
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. API1은 faci_cd, API2는 이름+주소 해시를
  // transform()과 동일하게 sourceId로 쓴다.
  // eslint-disable-next-line class-methods-use-this
  getRawRows({ api1Items, api2Items }) {
    const api1Raw = api1Items.filter((item) => item.faci_cd).map((item) => ({ sourceId: `A1_${item.faci_cd}`, payload: item }));
    const api2Raw = api2Items
      .map((item) => ({ item, name: item.BPLC_NM, address: item.ROAD_NM_ADDR || item.LOTNO_ADDR || '' }))
      .filter(({ name }) => name)
      .map(({ item, name, address }) => ({
        sourceId: `A2_${crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16)}`,
        payload: item,
      }));
    return [...api1Raw, ...api2Raw];
  }

  // eslint-disable-next-line class-methods-use-this
  transformApi1Item(item) {
    const name = item.faci_nm;
    const address = item.faci_road_addr || item.faci_addr || '';
    const lat = Number(item.faci_lat);
    const lng = Number(item.faci_lot);

    if (!name || !address || !item.faci_lat || !item.faci_lot) return null;

    const facilityType =
      item.inout_gbn_nm === '실내' ? '실내' : item.inout_gbn_nm === '실외' ? '야외' : '복합';

    return buildOpenSpaceRow({
      externalId: `SWIMMING_POOL_A1_${item.faci_cd}`,
      sourceType: 'SWIMMING_POOL',
      source: SOURCE,
      name,
      uiCategory: UI_CATEGORY.KIDS_ACTIVITY,
      address,
      lng,
      lat,
      isFree: deriveIsFreeFallback({ hasFeeInfo: false, isPublicProvider: item.faci_gb_nm === '공공' }),
      isKidsFriendly: matchesKidsKeyword(name),
      facilityType,
      rawData: item,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  transformApi2Item(item) {
    const name = item.BPLC_NM;
    const address = item.ROAD_NM_ADDR || item.LOTNO_ADDR || '';
    const x = Number(item.CRD_INFO_X);
    const y = Number(item.CRD_INFO_Y);

    if (!name || !address || !item.CRD_INFO_X || !item.CRD_INFO_Y) return null;

    const coords = convertEpsg5174ToWgs84(x, y);
    if (!coords) return null;

    const hash = crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16);

    return buildOpenSpaceRow({
      externalId: `SWIMMING_POOL_A2_${hash}`,
      sourceType: 'SWIMMING_POOL',
      source: SOURCE,
      name,
      uiCategory: UI_CATEGORY.KIDS_ACTIVITY,
      address,
      lng: coords.lng,
      lat: coords.lat,
      isFree: deriveIsFreeFallback({ hasFeeInfo: false, isPublicProvider: item.PBP_SE_NM === '공립' }),
      isKidsFriendly: matchesKidsKeyword(name),
      rawData: item,
    });
  }

  transform({ api1Items, api2Items }) {
    const activeApi1 = api1Items.filter((item) => item.faci_stat_nm === API1_ACTIVE_STATUS);
    const activeApi2 = api2Items.filter((item) => item.SALS_STTS_NM === API2_ACTIVE_STATUS);

    const rows = [];
    const seenDedupKeys = new Set();

    for (const item of activeApi1) {
      const row = this.transformApi1Item(item);
      if (!row) continue;
      seenDedupKeys.add(buildDedupKey(row.name, row.address));
      rows.push(row);
    }

    for (const item of activeApi2) {
      const row = this.transformApi2Item(item);
      if (!row) continue;
      const dedupKey = buildDedupKey(row.name, row.address);
      if (seenDedupKeys.has(dedupKey)) continue; // API1(공공)과 중복 — API1 데이터를 우선
      seenDedupKeys.add(dedupKey);
      rows.push(row);
    }

    return rows;
  }
}
