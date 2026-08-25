// SEOUL_YEYAK: 서울시 공공서비스예약 (data.seoul.go.kr, tvYeyakCOllect 통합 엔드포인트)
// 문화체험/교육강좌/체육시설/공간시설/진료복지 등 예약형 프로그램 전체를 한 엔드포인트가
// 함께 내려줌을 실제 호출로 확인함(implementation/2026-08-21-seoul-reservation-unified-collect.md).
//
// Decision 017(2026-08-25) 전면 재작성: 기존에는 DIV(분류) 필드 기준으로 events 테이블에만
// 몰아 적재하며 위치/날짜 등이 없으면 행을 드롭했다. 이제는 MAXCLASSNM(대분류) 기준으로
// 체육시설/공간시설은 open_spaces, 문화체험/교육강좌는 events로 분리 적재하고(진료복지 제외),
// 위치정보/요금/예약URL이 없어도 드롭하지 않고 NULL로 무조건 적재한다(항목 단위 try-catch로
// 무중단 처리, 진짜로 적재 불가능한 경우만 원인별로 집계해 skip).
//
// is_kids_friendly/has_parking/stroller_accessible/facility_type/target_age_group — Task 8-4
// 정밀 검증(2026-08-21)에서 발견: 이 필드들이 애초에 buildEventRow 호출에 전혀 전달되지 않아
// 2,527건 전체가 기본값(is_kids_friendly=false, facility_type='복합' 등)으로만 채워져 있었다.
// 원본에 USETGTINFO(이용대상, 예: "가족(학부모 1인, 자녀 1인)")·DTLCONT(상세내용) 등 실제 텍스트가
// 있어 seoul-culture-events.mjs가 이미 쓰는 deriveParentalTags(키워드 매칭, 추측 아님)를 동일하게
// 적용한다. 단, Decision 017 9항에 따라 open_spaces(체육시설/공간시설)의 키즈 뱃지만큼은 더
// 좁은 신호(USETGTINFO/MINCLASSNM)로만 판별하는 deriveSpaceKidsFriendly를 쓴다(오매핑 정화).
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildEventRow, buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { deriveParentalTags, deriveSpaceKidsFriendly } from '../lib/ai-tagging.mjs';

const BASE_URL = 'http://openapi.seoul.go.kr:8088';
const SERVICE_NAME = 'tvYeyakCOllect';
// Decision 017 6항: list_total_count 기반 Paging Loop를 1,000건 단위로 순회한다.
const PAGE_SIZE = 1000;
const OUTLINK_BASE = 'https://yeyak.seoul.go.kr/web/reservation/selectReservView.do';
const SOURCE = 'seoul_public_reservation';

// Decision 017 1항/4항: MAXCLASSNM(대분류) → 적재 대상 테이블. 진료복지는 놀거리/공간 도메인과
// 무관해 수집 범위에서 제외한다(맵에 없는 값은 transformSplit에서 UNKNOWN_MAXCLASSNM 에러로 집계).
const MAXCLASSNM_TABLE = {
  체육시설: 'open_spaces',
  공간시설: 'open_spaces',
  문화체험: 'events',
  교육강좌: 'events',
};

const EXCLUDED_MAXCLASSNM = '진료복지';

// Decision 017 9항: 강제 카테고리 매핑(체육시설 → KIDS_ACTIVITY 등) 전면 제거. 문화체험/
// 교육강좌는 "체험·클래스"라는 기존 UI_CATEGORY 라벨과 문자 그대로 대응돼 강제 매핑이 아니다.
// 체육시설/공간시설은 이 5대 카테고리 중 억지로 끼워 맞출 값이 없어 null(ETC)로 남긴다
// (spec/data/ai-rule.md 4.1 — 판별 불가 시 임의 매핑 금지).
const EVENTS_UI_CATEGORY = UI_CATEGORY.EXPERIENCE_CLASS;

function toDateOnly(dateTimeStr) {
  return dateTimeStr ? dateTimeStr.slice(0, 10) : null;
}

function isActiveStatus(svcStatNm) {
  if (!svcStatNm) return true;
  return !svcStatNm.includes('종료') && !svcStatNm.includes('마감');
}

// Task 9-6-7(2026-08-23) 버그 수정: AREANM이 항상 서울 자치구라는 가정이 틀렸음을 실측으로
// 확인함 — "서울시 공공서비스예약" API가 서울시(기관)이 운영/위탁하지만 실제로는 서울 밖에
// 있는 시설(예: 서울대공원·서울동물원은 경기도 과천시, "상주서울농장"은 경상북도 상주시,
// 지자체 간 협약 캠핑장 등은 충북/전남/경북 등)도 함께 내려준다. 이런 행에 "서울시 " 접두를
// 붙이면 "서울시 과천시"처럼 존재하지 않는 행정구역이 만들어져(대한민국 공식 행정구역명 기준,
// 과천시는 경기도 소속이지 서울시 소속이 아님) 검색/지역 필터가 오동작한다. AREANM이 실제
// 서울 25개 자치구 중 하나일 때만 "서울시 " 접두를 붙이고, 그 외에는 원본 AREANM을 그대로
// 쓴다(상위 시/도를 추측해서 붙이지 않음 — 제3장 제5조 추측 금지).
const SEOUL_GU_NAMES = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구',
  '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구',
  '관악구', '서초구', '강남구', '송파구', '강동구',
];

export function buildSigunguName(areanm) {
  if (!areanm) return null;
  return SEOUL_GU_NAMES.includes(areanm) ? `서울시 ${areanm}` : areanm;
}

// 에러 카운터 증가 헬퍼 — transformSplit()에서 반복 사용.
function bumpError(errorCounts, type) {
  errorCounts[type] = (errorCounts[type] || 0) + 1;
}

export class SeoulYeyakAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SEOUL_YEYAK', targetTable: 'multi', source: SOURCE });

    this.apiKey = process.env.SEOUL_OPEN_DATA_KEY;
    if (!this.apiKey) {
      throw new Error('SEOUL_OPEN_DATA_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  async fetchPage(startIdx, endIdx) {
    const url = `${BASE_URL}/${this.apiKey}/json/${SERVICE_NAME}/${startIdx}/${endIdx}/`;
    const res = await fetch(url);
    const text = await res.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${SERVICE_NAME} 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const body = json[SERVICE_NAME];
    if (body?.RESULT?.CODE !== 'INFO-000') {
      throw new Error(`${SERVICE_NAME} 오류: ${body?.RESULT?.CODE} ${body?.RESULT?.MESSAGE}`);
    }

    return { items: body.row ?? [], totalCount: body.list_total_count ?? 0 };
  }

  async fetch() {
    const items = [];
    let startIdx = 1;
    let totalCount = Infinity;

    while (startIdx <= totalCount) {
      const endIdx = startIdx + PAGE_SIZE - 1;
      const page = await this.fetchPage(startIdx, endIdx);
      totalCount = page.totalCount;
      items.push(...page.items);
      startIdx += PAGE_SIZE;
    }

    return items;
  }

  // RAW 레이어 opt-in. transform과 달리 유효성 검증/드롭이 없어야 하므로 SVCID만 있으면
  // 보존한다. 단, Decision 017이 정의한 수집 범위(진료복지 제외) 밖의 항목은 애초에 이
  // 어댑터의 "보존 대상 원천 데이터"가 아니므로 RAW 레이어에도 남기지 않는다.
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems
      .filter((item) => item.SVCID && item.MAXCLASSNM !== EXCLUDED_MAXCLASSNM)
      .map((item) => ({ sourceId: item.SVCID, payload: item }));
  }

  // Decision 017: MAXCLASSNM 기준으로 open_spaces/events 두 테이블에 나눠 담는다. 항목 1건
  // 단위 try-catch로 무중단을 보장하고, 위치/요금/예약URL 등 미비 항목은 드롭하지 않고 NULL로
  // 적재한다 — 진짜로 적재 불가능한 경우(식별자 없음, DB NOT NULL을 만족할 실데이터가 없는
  // 경우)만 errorCounts에 원인별로 집계하고 skip한다.
  // eslint-disable-next-line class-methods-use-this
  transformSplit(rawItems) {
    const openSpaceRows = [];
    const eventRows = [];
    const errorCounts = {};
    let excludedCount = 0;

    for (const item of rawItems) {
      try {
        if (item.MAXCLASSNM === EXCLUDED_MAXCLASSNM) {
          excludedCount += 1;
          continue;
        }

        const table = MAXCLASSNM_TABLE[item.MAXCLASSNM];
        if (!table) {
          bumpError(errorCounts, 'UNKNOWN_MAXCLASSNM');
          continue;
        }

        if (!item.SVCID) {
          bumpError(errorCounts, 'MISSING_SVCID');
          continue;
        }
        if (!item.SVCNM) {
          bumpError(errorCounts, 'MISSING_NAME');
          continue;
        }

        // Null-safe 원본 적재(Decision 017 4항): 좌표가 없거나 파싱 불가하면 드롭하지 않고
        // location_precision='UNKNOWN'(location=NULL)으로 적재한다. 좌표 필드 자체가 있는데
        // 숫자로 파싱되지 않는 경우만 COORDINATE_PARSE_FAIL로 집계한다(진짜 이상 데이터 표시,
        // 그래도 드롭하지는 않는다).
        const lng = item.X ? Number(item.X) : null;
        const lat = item.Y ? Number(item.Y) : null;
        const hasCoords = lng != null && lat != null && Number.isFinite(lng) && Number.isFinite(lat);
        if ((item.X || item.Y) && !hasCoords) {
          bumpError(errorCounts, 'COORDINATE_PARSE_FAIL');
        }
        const locationPrecision = hasCoords ? 'EXACT' : 'UNKNOWN';

        const reservationUrl = `${OUTLINK_BASE}?rsv_svc_id=${item.SVCID}`;
        const broadTags = deriveParentalTags(JSON.stringify(item));
        const sigunguName = buildSigunguName(item.AREANM);

        if (table === 'events') {
          const startDate = toDateOnly(item.SVCOPNBGNDT);
          const endDate = toDateOnly(item.SVCOPNENDDT);
          if (!startDate || !endDate) {
            bumpError(errorCounts, 'DATE_PARSE_FAIL');
            continue;
          }

          const row = buildEventRow({
            externalId: `SEOUL_YEYAK_${item.SVCID}`,
            title: item.SVCNM,
            uiCategory: EVENTS_UI_CATEGORY,
            source: SOURCE,
            startDate,
            endDate,
            lng: hasCoords ? lng : null,
            lat: hasCoords ? lat : null,
            locationPrecision,
            isReservationRequired: true, // SEOUL_YEYAK 소스는 전건 "사전 예약 필수" 뱃지 기본 부여
            reservationUrl,
            reservationStartDate: item.RCPTBGNDT || null,
            reservationEndDate: item.RCPTENDDT || null,
            isFree: item.PAYATNM === '무료',
            thumbnailUrl: item.IMGURL || null,
            isActive: isActiveStatus(item.SVCSTATNM),
            isKidsFriendly: broadTags.is_kids_friendly,
            hasParking: broadTags.has_parking,
            strollerAccessible: broadTags.stroller_accessible,
            facilityType: broadTags.facility_type,
            targetAgeGroup: broadTags.target_age_group,
            venueName: item.PLACENM || null,
            sigunguName,
            rawData: item,
          });
          if (!row) {
            bumpError(errorCounts, 'SCHEMA_BUILD_FAIL');
            continue;
          }
          eventRows.push(row);
        } else {
          // Decision 017 9항: 체육/공간시설의 키즈 뱃지는 넓은 텍스트 스캔이 아니라 USETGTINFO/
          // MINCLASSNM 두 필드로만 판별한다(오매핑 정화). 카테고리는 억지로 끼워 맞추지 않고 null.
          const row = buildOpenSpaceRow({
            externalId: `SEOUL_YEYAK_${item.SVCID}`,
            sourceType: 'SEOUL_YEYAK',
            source: SOURCE,
            name: item.SVCNM,
            uiCategory: null,
            address: null,
            lng: hasCoords ? lng : null,
            lat: hasCoords ? lat : null,
            locationPrecision,
            isFree: item.PAYATNM === '무료',
            infoUrl: reservationUrl,
            isKidsFriendly: deriveSpaceKidsFriendly({ useTargetInfo: item.USETGTINFO, minClassName: item.MINCLASSNM }),
            hasParking: broadTags.has_parking,
            strollerAccessible: broadTags.stroller_accessible,
            facilityType: broadTags.facility_type,
            targetAgeGroup: broadTags.target_age_group,
            rawData: item,
            sigunguName,
          });
          if (!row) {
            bumpError(errorCounts, 'SCHEMA_BUILD_FAIL');
            continue;
          }
          openSpaceRows.push(row);
        }
      } catch (err) {
        bumpError(errorCounts, 'UNEXPECTED_ERROR');
        console.error(`  ⚠️ [SEOUL_YEYAK] 항목 처리 중 예외(SVCID=${item?.SVCID ?? '?'}): ${err.message}`);
      }
    }

    return { open_spaces: openSpaceRows, events: eventRows, errorCounts, excludedCount };
  }
}
