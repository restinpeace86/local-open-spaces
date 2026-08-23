// SEOUL_YEYAK: 서울시 공공서비스예약 (data.seoul.go.kr, tvYeyakCOllect 통합 엔드포인트)
// 문화행사/시설대관/진료/체육시설/교육 등 예약형 프로그램 전체를 커버함을 실제 호출로 확인함
// (implementation/2026-08-21-seoul-reservation-unified-collect.md 참고).
//
// is_kids_friendly/has_parking/stroller_accessible/facility_type/target_age_group — Task 8-4
// 정밀 검증(2026-08-21)에서 발견: 이 필드들이 애초에 buildEventRow 호출에 전혀 전달되지 않아
// 2,527건 전체가 기본값(is_kids_friendly=false, facility_type='복합' 등)으로만 채워져 있었다.
// 원본에 USETGTINFO(이용대상, 예: "가족(학부모 1인, 자녀 1인)")·DTLCONT(상세내용) 등 실제 텍스트가
// 있어 seoul-culture-events.mjs가 이미 쓰는 deriveParentalTags(키워드 매칭, 추측 아님)를 동일하게
// 적용한다.
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildEventRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { deriveParentalTags } from '../lib/ai-tagging.mjs';

const BASE_URL = 'http://openapi.seoul.go.kr:8088';
const SERVICE_NAME = 'tvYeyakCOllect';
const PAGE_SIZE = 100;
const OUTLINK_BASE = 'https://yeyak.seoul.go.kr/web/reservation/selectReservView.do';

// 서울시 DIV(분류) → 5대 UI 카테고리. 놀거리 도메인과 무관한 분류(예: 진료)는
// 임의로 끼워 맞추지 않고 null(ETC)로 남긴다 (spec/data/ai-rule.md 4.1).
const DIV_TO_UI_CATEGORY = {
  문화행사: UI_CATEGORY.PERFORMANCE_FESTIVAL,
  체육시설: UI_CATEGORY.KIDS_ACTIVITY,
  교육: UI_CATEGORY.EXPERIENCE_CLASS,
  시설대관: null,
  진료: null,
};

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

export class SeoulYeyakAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'SEOUL_YEYAK', targetTable: 'events' });

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

  // eslint-disable-next-line class-methods-use-this
  transform(rawItems) {
    return rawItems.map((item) => {
      const lng = Number(item.X);
      const lat = Number(item.Y);
      if (!lng || !lat || !item.SVCID || !item.SVCNM || !item.SVCOPNBGNDT || !item.SVCOPNENDDT) {
        return null;
      }

      // SVCID로부터 예약 Outlink URL을 직접 구성한다 (API의 SVCURL 필드에 의존하지 않음 —
      // 응답 포맷이 바뀌어도 이 어댑터가 자체적으로 안정적인 링크를 생성하도록 함).
      const reservationUrl = `${OUTLINK_BASE}?rsv_svc_id=${item.SVCID}`;

      // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트(USETGTINFO/DTLCONT 등)를 근거로만 태깅한다.
      const tags = deriveParentalTags(JSON.stringify(item));

      return buildEventRow({
        externalId: `SEOUL_YEYAK_${item.SVCID}`,
        title: item.SVCNM,
        uiCategory: DIV_TO_UI_CATEGORY[item.DIV] ?? null,
        startDate: toDateOnly(item.SVCOPNBGNDT),
        endDate: toDateOnly(item.SVCOPNENDDT),
        lng,
        lat,
        isReservationRequired: true, // SEOUL_YEYAK 소스는 전건 "사전 예약 필수" 뱃지 기본 부여
        reservationUrl,
        reservationStartDate: item.RCPTBGNDT || null,
        reservationEndDate: item.RCPTENDDT || null,
        isFree: item.PAYATNM === '무료',
        thumbnailUrl: item.IMGURL || null,
        isActive: isActiveStatus(item.SVCSTATNM),
        isKidsFriendly: tags.is_kids_friendly,
        hasParking: tags.has_parking,
        strollerAccessible: tags.stroller_accessible,
        facilityType: tags.facility_type,
        targetAgeGroup: tags.target_age_group,
        venueName: item.PLACENM || null, // Task 9-1-1: 실측 확인된 실제 장소명 필드
        // Task 9-1-3: 실측 확인된 실제 구 단위 지역명 필드(AREANM). Task 9-1-12에서 이 API가
        // 서울만 다룬다고 가정해 항상 "서울시 " 접두를 붙였으나, Task 9-6-7 실측으로 서울시
        // 기관이 운영하는 서울 밖 시설(과천시의 서울대공원 등)도 섞여 있음을 확인해
        // buildSigunguName()이 실제 서울 자치구일 때만 접두를 붙이도록 정정했다.
        sigunguName: buildSigunguName(item.AREANM),
      });
    });
  }
}
