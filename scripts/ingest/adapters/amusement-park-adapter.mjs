// LOCALDATA_AMUSEMENT: 행정안전부 문화_테마파크업(기타) 인허가 정보
// (apis.data.go.kr/1741000/amusement_facilities_other/info).
//
// 2026-08-21 실제 호출로 확인: 과거 두 차례 스킵 사유였던 SERVICE_KEY_IS_NOT_REGISTERED_ERROR는
// 사실 서비스키 미승인이 아니라 수동 curl 테스트 시 `+` 문자를 URL 인코딩하지 않아 발생한
// 재현 오류였음(요청받은 서비스키를 URLSearchParams로 정상 인코딩하면 resultCode '0'으로 실 데이터
// 7,201건을 정상 수신함 — public-facility-open-adapter와 동일하게 URLSearchParams를 사용해 이 문제를
// 원천적으로 회피한다).
//
// 좌표: 원본 CRD_INFO_X/CRD_INFO_Y는 WGS84 위경도가 아니라 투영좌표계 값이다. 이 API는
// local-data-kids-adapter가 다루는 것과 동일한 "행정안전부 지방행정인허가 데이터"(유원시설업 등)
// 계열이며, epsg5174.mjs에 이미 이 데이터 계열의 좌표계가 EPSG:5174(Korean 1985 Central Belt,
// Bessel)라고 명시돼 있다. 실제로 표본 좌표(CRD_INFO_X=218170.93, CRD_INFO_Y=458956.33, 주소:
// "경기도 남양주시 금곡동")를 EPSG:5174 → WGS84 변환하면 (lat 37.633, lng 127.204)로 남양주시
// 좌표와 정확히 일치함을 확인했다 — 과업 지시서의 "Vworld 지오코더 연동"은 원본에 좌표 필드가
// 없다는 가정 하의 지시였으나, 실제로는 투영좌표가 포함돼 있어 이미 검증된 동일 계열 변환기를
// 재사용하는 편이 미설정된 VWORLD_API_KEY에 의존하는 것보다 정확하고 즉시 동작 가능하다
// (CLAUDE.md 제3장 제4조 추측 금지 — 실측으로 검증된 사실만 반영).
//
// 카테고리: CULTR_SPTS_TPBIZ_NM은 실측 결과 전량 "신고테마파크업"(민간 유원시설업)이며,
// spec/data/ai-rule.md 3.1의 open_spaces 3대 원본 카테고리(PARK/SPORTS/CULTURE) 중 어디에도
// 명확히 해당하지 않는다(공공체육시설이 아닌 민간 상업 유원시설이라 SPORTS 정의와도 다름).
// 3.3 매핑표 역시 3.1/3.2 원본값에서만 파생되므로 이 업종에는 매핑이 없다. ai-rule.md 4.1
// "분류 불확실성 대응" 원칙에 따라 임의로 5대 UI 카테고리 중 하나에 끼워 맞추지 않고
// uiCategory를 지정하지 않아 schema-mapper의 기본값(ETC)으로 떨어뜨린다.
//
// 상태 필터: 실측 결과 DTL_SALS_STTS_NM은 '영업중'/'폐업'/'조건이행완료'/'직권말소'/'신고취소'/
// '영업장폐쇄' 6종이 관측되며, 과업 지시서의 "영업중 상태코드 필터링"에 따라 '영업중'만 수집한다.
//
// 고유 ID: MNG_NO(관리번호)는 실측 결과 다건의 서로 다른 사업장이 동일 값을 공유해(예: 하나의
// MNG_NO에 12개 이상의 무관한 사업장명이 매핑됨) 고유 식별자로 사용할 수 없음을 확인했다.
// local-data-kids-adapter/public-facility-open-adapter와 동일하게 사업장명+주소의 결정적 해시를
// external_id로 사용한다.
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { buildOpenSpaceRow } from './lib/schema-mapper.mjs';
import { convertEpsg5174ToWgs84 } from './lib/epsg5174.mjs';
import { deriveParentalTags } from '../lib/ai-tagging.mjs';

const BASE_URL = 'https://apis.data.go.kr/1741000/amusement_facilities_other/info';
const PAGE_SIZE = 100;
const ACTIVE_STATUS_NAME = '영업중';
const SOURCE = 'localdata_amusement';

// MNG_NO(관리번호)는 실측 결과 고유하지 않아(위 주석 참고) external_id와 동일하게 사업장명+
// 주소의 결정적 해시를 식별자로 쓴다 — transform()/getRawRows() 양쪽에서 재사용한다.
function hashKey(name, address) {
  return crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16);
}

export class AmusementParkAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'LOCALDATA_AMUSEMENT', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. 원본에 고유 ID가 없어(MNG_NO 중복) 이름+주소
  // 해시를 sourceId로 쓴다 — external_id 생성 로직과 동일한 키다. 이름/주소가 전혀 없는 항목만
  // 제외한다(복합키 구성 불가 — transform()의 좌표 필수 검증과 달리 RAW 레이어는 좌표 없이도 보존).
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems
      .map((item) => ({ item, name: item.BPLC_NM, address: item.ROAD_NM_ADDR || item.LOTNO_ADDR || '' }))
      .filter(({ name, address }) => name && address)
      .map(({ item, name, address }) => ({ sourceId: hashKey(name, address), payload: item }));
  }

  async fetchPage(pageNo) {
    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      returnType: 'json',
    });

    const url = `${BASE_URL}?${params.toString()}`;
    const res = await fetchWithTimeout(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`AmusementPark 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`AmusementPark 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    // 서비스키 미등록 등 공통 오류는 response가 아닌 OpenAPI_ServiceResponse 봉투로 내려온다.
    const errHeader = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (errHeader) {
      throw new Error(
        `AmusementPark 에러 응답: ${errHeader.returnReasonCode} ${errHeader.errMsg} (${errHeader.returnAuthMsg})`
      );
    }

    const header = json.response?.header;
    if (header?.resultCode !== '0') {
      throw new Error(`AmusementPark 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const items = json.response?.body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: Number(json.response?.body?.totalCount ?? 0),
    };
  }

  async fetch() {
    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while ((pageNo - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchPage(pageNo);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageNo += 1;
    }

    return items;
  }

  // eslint-disable-next-line class-methods-use-this
  transform(rawItems) {
    return rawItems
      .filter((item) => item.DTL_SALS_STTS_NM === ACTIVE_STATUS_NAME)
      .map((item) => {
        const name = item.BPLC_NM;
        const address = item.ROAD_NM_ADDR || item.LOTNO_ADDR || '';

        if (!name || !address || !item.CRD_INFO_X || !item.CRD_INFO_Y) return null;

        const coords = convertEpsg5174ToWgs84(Number(item.CRD_INFO_X), Number(item.CRD_INFO_Y));
        if (!coords) return null;

        const hash = hashKey(name, address);

        // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트를 근거로만 태깅한다.
        const tags = deriveParentalTags(JSON.stringify(item));

        return buildOpenSpaceRow({
          externalId: `LOCALDATA_AMUSEMENT_${hash}`,
          sourceType: 'LOCALDATA_AMUSEMENT',
          source: SOURCE,
          name,
          // ai-rule.md 3.1/3.3/4.1: 유원시설업은 PARK/SPORTS/CULTURE 어디에도 명확히 해당하지
          // 않아 임의 매핑하지 않고 schema-mapper 기본값(ETC)에 맡긴다.
          uiCategory: null,
          address,
          lng: coords.lng,
          lat: coords.lat,
          // 원본에 요금 정보 필드가 없고 민간 사업장이 섞여 있어 국공립 Fallback(ai-rule.md
          // 5.2-7)을 적용할 수 없다 — 임의 추정하지 않고 null 유지.
          isFree: null,
          facilityType: tags.facility_type,
          isKidsFriendly: tags.is_kids_friendly,
          hasParking: tags.has_parking,
          strollerAccessible: tags.stroller_accessible,
          targetAgeGroup: tags.target_age_group,
          rawData: item,
        });
      })
      .filter(Boolean);
  }
}
