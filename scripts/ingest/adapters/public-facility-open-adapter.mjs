// PUBLIC_FACILITY_OPEN: 전국공공시설개방표준데이터 (data.go.kr, tn_pubr_public_pblfclt_opn_info_api)
// 2026-08-21 실제 호출로 확인: `PUBLIC_DATA_API_KEY`(TourAPI 4.0과 동일 인증키)로 정상 응답(resultCode
// '00')을 수신했다(과거 두 차례 스킵 사유였던 SERVICE_KEY_IS_NOT_REGISTERED_ERROR는 서비스키
// 활용신청이 승인되며 해소됨 — implementation/todo.md 스킵 로그 참고).
// 원본 응답은 다른 TourAPI 계열(`response.header`)과 달리 `header`/`body`가 최상위에 바로 온다.
//
// 원본에 latitude/longitude 필드가 직접 포함되어 있어(go-camping-adapter의 mapX/mapY와 동일 패턴)
// 별도 Vworld 지오코딩 없이 원본 좌표를 그대로 사용한다 — 주소 텍스트만 있고 좌표가 없는
// cultural-facility-summary-adapter와는 데이터 특성이 달라 CLAUDE.md 제3장 제4조(추측 금지) 위반이
// 아니라 실제 응답 스키마를 있는 그대로 반영한 것이다.
//
// spec/data/ai-rule.md 3.1은 공공체육시설(축구장/테니스장/다목적 체육관 등)을 `SPORTS`로 분류하고,
// 3.3 매핑표는 `SPORTS`를 UI 카테고리 🎡 키즈·액티비티(KIDS_ACTIVITY)로 묶는다.
//
// 원본에 시설별 고유 ID 필드가 없어(local-data-kids-adapter와 동일 상황) 기관코드+시설명+주소의
// 결정적 해시를 external_id로 사용한다.
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { deriveParentalTags, deriveIsFreeFromFeeText } from '../lib/ai-tagging.mjs';

const BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_pblfclt_opn_info_api';
const PAGE_SIZE = 100;
const SOURCE = 'public_facility_open';

function hashKey(item, name, address) {
  return crypto
    .createHash('sha1')
    .update(`${item.insttCode || ''}|${name}|${address}`)
    .digest('hex')
    .slice(0, 16);
}

// pchrgUseYn(유료사용여부)이 원본 데이터의 명시적 Y/N 플래그라 이를 1차 근거로 쓰고,
// 플래그가 없는 예외적인 경우에만 rntfee(대여료) 텍스트를 파싱해 보조 판별한다
// (spec/data/ai-rule.md 5.2-7 / 4.1 추측 금지 — 근거 텍스트가 있을 때만 결정적으로 판별).
function resolveIsFree(item) {
  if (item.pchrgUseYn === 'Y') return false;
  if (item.pchrgUseYn === 'N') return true;
  return deriveIsFreeFromFeeText(item.rntfee);
}

function buildOperatingHours(item) {
  const weekday =
    item.weekdayOperOpenHhmm && item.weekdayOperColseHhmm
      ? `평일 ${item.weekdayOperOpenHhmm}~${item.weekdayOperColseHhmm}`
      : null;
  const weekend =
    item.wkendOperOpenHhmm && item.wkendOperCloseHhmm
      ? `주말 ${item.wkendOperOpenHhmm}~${item.wkendOperCloseHhmm}`
      : null;
  const parts = [weekday, weekend].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export class PublicFacilityOpenAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'PUBLIC_FACILITY_OPEN', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  async fetchPage(pageNo) {
    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      type: 'json',
    });

    const url = `${BASE_URL}?${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`PublicFacilityOpen 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`PublicFacilityOpen 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    if (json.header?.resultCode !== '00') {
      throw new Error(`PublicFacilityOpen 에러 응답: ${json.header?.resultCode} ${json.header?.resultMsg}`);
    }

    const items = json.body?.items?.item ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: Number(json.body?.totalCount ?? 0),
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

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. 원본에 고유 ID가 없어 external_id와 동일하게
  // 기관코드+시설명+주소 해시를 sourceId로 쓴다.
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems
      .map((item) => ({ item, name: item.openFcltyNm, address: item.rdnmadr || item.lnmadr || '' }))
      .filter(({ name }) => name)
      .map(({ item, name, address }) => ({ sourceId: hashKey(item, name, address), payload: item }));
  }

  // eslint-disable-next-line class-methods-use-this
  transform(rawItems) {
    return rawItems
      .map((item) => {
        const name = item.openFcltyNm;
        const address = item.rdnmadr || item.lnmadr || '';
        const lng = Number(item.longitude);
        const lat = Number(item.latitude);

        if (!name || !lng || !lat) return null;

        const hash = hashKey(item, name, address);

        // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트를 근거로만 태깅한다.
        const tags = deriveParentalTags(JSON.stringify(item));

        return buildOpenSpaceRow({
          externalId: `PUBLIC_FACILITY_OPEN_${hash}`,
          sourceType: 'PUBLIC_FACILITY_OPEN',
          source: SOURCE,
          name,
          uiCategory: UI_CATEGORY.KIDS_ACTIVITY,
          address,
          lng,
          lat,
          isFree: resolveIsFree(item),
          operatingHours: buildOperatingHours(item),
          infoUrl: item.homepageUrl || null,
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
