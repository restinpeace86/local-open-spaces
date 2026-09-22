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
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { buildEventRow, buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { deriveParentalTags, deriveSpaceKidsFriendly } from '../lib/ai-tagging.mjs';
import { bumpError } from '../lib/error-counts.mjs';
import { extractYeyakDescription } from '../lib/seoul-yeyak-description.mjs';
import { parsePriceFromText } from './lib/price-parser.mjs';
import { kstNaiveDatetimeToUtcIso } from '../lib/kst-date-range.mjs';

const BASE_URL = 'http://openapi.seoul.go.kr:8088';
const SERVICE_NAME = 'tvYeyakCOllect';
// Decision 017 6항: list_total_count 기반 Paging Loop를 1,000건 단위로 순회한다.
const PAGE_SIZE = 1000;
const OUTLINK_BASE = 'https://yeyak.seoul.go.kr/web/reservation/selectReservView.do';
const SOURCE = 'seoul_public_reservation';

// [여기저기/일반 서울형키즈카페 구분](2026-09-20 사용자 지시): "여기저기 서울형키즈카페랑
// 일반키즈카페랑 기준 다른건 알지?" — 원본 MINCLASSNM만으로는 "여기저기"(9월 공지,
// 한강공원/근린공원 등 공원형 팝업 30개소)와 "일반"(동네 상설 지점망)을 구분할 수
// 없다(실측 확인: 둘 다 MINCLASSNM='서울형키즈카페'로 동일). 제목에 "키즈카페"가
// 있는지도 신뢰할 수 없다(반례 실측 확인: "서울형 키즈카페 시립 서울식물원점"은
// "여기저기" 30개소에 속하지만 제목에 "키즈카페"가 들어있다). 사용자가 제시한 공식
// 30개소 명단(SVCNM 원문)만이 유일하게 검증된 구분 신호라 그대로 하드코딩한다
// (추측이 아니라 사용자가 공지문으로 확인해 준 값, 제3장 제5조 예외). 2026-09-20
// 기준 30곳 중 11곳만 실제로 API에 존재하지만, 나머지 19곳도 미리 포함해 두면
// 서울시가 나중에 게시하는 즉시(제목이 뭐든) 정확히 분류된다.
const YEOGIJEOGI_KIDS_CAFE_LOCATIONS = new Set([
  '강남구 잠원한강공원',
  '강동구 광나루한강공원',
  '강북구 북서울꿈의숲 청운답원',
  '강북구 솔밭근린공원',
  '강서구 마곡하늬공원',
  '서울형 키즈카페 시립 서울식물원점', // 강서구 서울식물원 — 제목에 "키즈카페"가 있는 예외 케이스.
  '강서구 허준근린공원',
  '광진구 구의공원',
  '광진구 뚝섬한강공원',
  '광진구 서울어린이대공원',
  '구로구 오류역광장',
  '금천구 금천녹색광장',
  '노원구 화랑대 철도공원',
  '도봉구 다락원체육공원',
  '동대문구 배봉산 근린공원',
  '마포구 난지한강공원 스타숲',
  '마포구 망원한강공원',
  '서대문 홍제동 문화공원',
  '성동구 꽃재어린이공원',
  '성북구 길빛근린공원',
  '송파구 잠실근린공원',
  '서울형 키즈카페 양천구 오목공원점', // 양천구 오목공원 — 제목에 "키즈카페"가 있는 예외 케이스.
  '양천구 파리공원',
  '영등포구 여의도한강공원',
  '영등포구 영등포공원',
  '용산구 노들섬 수변부',
  '용산구 이촌한강공원',
  '은평구 은평평화공원',
  '은평구 증산문화공원',
  '중랑구 중랑캠핑숲',
]);

// Decision 017 1항/4항 → Decision 024로 개정(2026-09-11, 사용자 명시적 재확인,
// implementation/todo.md 개선사항9): "체육시설 대분류와 축구장/농구장 등 시설 대관
// 예약관련 데이터가 open_spaces에 보이는데 events로 이관해달라." 체육시설/공간시설도
// 대관·사전예약제 "슬롯" 데이터라 본질적으로 시한성이라는 지적을 받아들여 open_spaces
// → events로 재라우팅한다(Decision 024). 결과적으로 진료복지(수집 제외) 외 전 항목이
// events로 단일화된다. 진료복지는 여전히 놀거리/공간 도메인과 무관해 수집 범위에서
// 제외한다(맵에 없는 값은 transformSplit에서 UNKNOWN_MAXCLASSNM 에러로 집계).
const MAXCLASSNM_TABLE = {
  체육시설: 'events',
  공간시설: 'events',
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

// [원천 필드 직접 반영 — 연령 카테고리 규칙](2026-09-19 사용자 지시, todo.md 개선사항 1
// 최종 확정): "613건 리스트에 대하여 내가 직접 명시하고 작성한 것들 외에는 아무것도
// 넣지 않는다" — 사용자가 명시한 규칙(성인 정확 일치→ADULT, 단체/여성/장애인→OTHER,
// 고학년/4학년이상→TEEN) 딱 이 4가지만 어댑터 레벨에서 직접 판정한다. KIDS_SCHOOL/
// INFANT/FAMILY/KIDS_PRE 등은 전혀 건드리지 않는다(명시적으로 지정한 적 없음).
//
// [설계 히스토리] 처음엔 이 규칙을 공용 target-audience-taxonomy.mjs(모든 이벤트에
// 광범위하게 쓰이는 키워드 매칭 엔진)에 반영했다가, "초등"을 KIDS_SCHOOL 무조건
// 매칭에서 빼면서 그 자리를 대신 기존의 다른 무관한 규칙(가족→FAMILY, 유아→KIDS_PRE,
// 청년→YOUTH 등)이 채우는 부작용이 생겨(사용자 지적으로 발견) 전부 되돌렸다. ADULT
// 규칙과 완전히 동일하게 이 어댑터에서만 좁게 직접 판정하는 것이 맞다(공용 엔진은
// 전혀 건드리지 않음 — 부작용 없음).
export function classifyTargetAudienceFromUseTgtInfo(useTgtInfo) {
  if (typeof useTgtInfo !== 'string' || !useTgtInfo.trim()) return null;
  if (useTgtInfo === '성인') return 'ADULT';
  if (/단체|여성|장애인/.test(useTgtInfo)) return 'OTHER';
  // 사용자 확인: "명시적 단어만(고학년/4학년이상 등)" — "4~6학년"처럼 숫자 범위만
  // 있고 이 단어들이 없으면 신호로 인정하지 않는다(추측 금지).
  if (/고학년|4\s*학년\s*이상/.test(useTgtInfo)) return 'TEEN';
  return null;
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
    const res = await fetchWithTimeout(url);
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

        // [실사용 버그 제보](2026-09-20 사용자 지시, 마포구 망원한강공원 서울형키즈카페
        // 사례) "예약하기 눌렀는데 페이지 표시할 수 없대" — 기존엔 SVCID로 이
        // yeyak.seoul.go.kr URL을 항상 직접 구성했는데(아래 OUTLINK_BASE), 이는 대부분의
        // 레코드에서 SVCURL과 우연히 동일해(2026-08-22 결정 당시 실측으로 확인된 우연의
        // 일치를 "항상 같다"로 잘못 일반화한 것) 원본 SVCURL을 별도로 안 쓰기로 했었다.
        // 그런데 서울형키즈카페(MINCLASSNM)는 SVCID가 "XML-{시설ID}" 형식이라 이 템플릿에
        // 넣으면 깨진 URL이 되고, 실제 예약 페이지는 완전히 다른 도메인(umppa.seoul.go.kr)
        // 이다 — 실측 확인(원본 SVCURL 필드에 이미 올바른 URL이 들어있음). 추측으로
        // 재구성하는 대신 원본 필드를 그대로 신뢰하고, SVCURL이 없는 극히 드문 경우에만
        // 기존 구성 방식으로 안전하게 폴백한다(제3장 제5조 추측 금지).
        const reservationUrl = item.SVCURL || `${OUTLINK_BASE}?rsv_svc_id=${item.SVCID}`;
        const broadTags = deriveParentalTags(JSON.stringify(item));
        const sigunguName = buildSigunguName(item.AREANM);
        // [카테고리 정제 & 어드민 확장](2026-08-26): MINCLASSNM은 이 소스만 갖고 있는 서울시
        // 표준 원본 필드다 — 다른 어댑터처럼 이름 키워드로 추론할 필요 없이 곧바로 RAW로
        // 태깅한다(scripts/migrations/2026-08-26-category-rules-engine.sql 4절과 동일 규약).
        // [여기저기/일반 서울형키즈카페 구분](2026-09-20 사용자 지시, 위
        // YEOGIJEOGI_KIDS_CAFE_LOCATIONS 주석 참고): MINCLASSNM='서울형키즈카페'인 건만
        // 예외적으로 공식 30개소 명단과 대조해 "여기저기"/"일반"(공공키즈카페)으로
        // 나눈다 — 그 외 모든 MINCLASSNM은 기존 그대로 곧바로 RAW 태깅한다.
        const categoryMin =
          item.MINCLASSNM === '서울형키즈카페'
            ? YEOGIJEOGI_KIDS_CAFE_LOCATIONS.has(item.SVCNM)
              ? '서울형키즈카페'
              : '공공키즈카페'
            : item.MINCLASSNM || null;
        const categoryMinSource = categoryMin ? 'RAW' : null;
        // [Decision 024(2026-09-11)] 체육시설/공간시설은 이제 이 events 분기를 함께
        // 지나가지만, Decision 017 9항의 "공간형 시설은 좁은 키즈 판별/일반 UI 카테고리
        // 라벨 배제" 규칙은 유지해야 한다(둘 다 아래에서 참조).
        const isSpaceLikeMaxClass = item.MAXCLASSNM === '체육시설' || item.MAXCLASSNM === '공간시설';
        // [원천 필드 직접 반영](2026-09-18 사용자 지시): "PAYATNM: 무료로 되어있는데
        // 이건 가격이 무료로 되어있는거 아니야? 해당 항목들에 대하여서는 가격 무료로
        // 박아줘" — PAYATNM은 유료/무료만 구분하는 구조화된 필드라 텍스트 마이닝
        // (parsePriceFromText)보다 신뢰도가 높다. DTLCONT 본문에 "이용료: 무료"처럼
        // 라벨과 함께 나오지 않으면 parsePriceFromText가 못 찾아 price_text가 계속
        // null로 남던 문제를 해결한다. PAYATNM이 무료가 아니면 기존 텍스트 파싱 그대로.
        const priceText = item.PAYATNM === '무료' ? '무료' : parsePriceFromText(item.DTLCONT);
        // [원천 필드 직접 반영](2026-09-18/19 사용자 지시) — 위 classifyTargetAudienceFromUseTgtInfo 참고.
        const targetAudience = classifyTargetAudienceFromUseTgtInfo(item.USETGTINFO);

        if (table === 'events') {
          const startDate = toDateOnly(item.SVCOPNBGNDT);
          const endDate = toDateOnly(item.SVCOPNENDDT);
          if (!startDate || !endDate) {
            bumpError(errorCounts, 'DATE_PARSE_FAIL');
            continue;
          }

          // [타임존 버그 수정](2026-09-22 사용자 지시로 검토 중 발견): RCPTBGNDT/
          // RCPTENDDT("2026-08-25 09:00:00.0")는 시간대 표시가 없는 한국시간(KST)
          // 문자열인데, 그동안 이걸 그대로 timestamptz 컬럼에 넣어 Postgres가 UTC로
          // 잘못 해석하고 있었다(실측: 9시간 밀림 확인) — kstNaiveDatetimeToUtcIso로
          // 명시적으로 KST임을 밝혀 변환한다.
          const reservationStartDateIso = kstNaiveDatetimeToUtcIso(item.RCPTBGNDT);
          const reservationEndDateIso = kstNaiveDatetimeToUtcIso(item.RCPTENDDT);
          // [예약 오픈 알림 자동 동기화](2026-09-22 사용자 지시): "seoul_reservation쪽은
          // 예약 시간 있는걸로 아는데 넣는건 좀 그렇나?" — 검토 결과 이 소스는 이미
          // 실제 접수 시작 시각을 갖고 있어(위에서 막 시간대까지 바로잡음), 관리자가
          // 수동으로 다시 입력할 필요 없이 그 값을 그대로 예약 오픈 알림
          // (next_reservation_open_at)에 반영한다 — "규칙을 추측"하는 게 아니라 이미
          // 확인된 실제 데이터를 재사용하는 것이라 제3장 제5조(추측 금지)에 저촉되지
          // 않는다고 판단했다(사용자 확인). 이미 지난 시각이면(예약이 이미 열렸음)
          // 알릴 "다음" 시점이 없으므로 null로 둔다 — buildEventRow가 이 값을
          // ALWAYS_REFRESH_FIELDS로 다루므로(scripts/ingest/lib/supabase-admin.mjs),
          // null이면 기존 값을 보존하고(다른 소스가 수동으로 채워둔 값을 지우지
          // 않음) 미래 값이면 매일 최신 값으로 갱신된다.
          //
          // [서울형키즈카페/공공키즈카페는 이 자동 동기화 대상에서 제외] 이 두
          // 카테고리는 별도 사용자 지시(2026-09-20)로 "자치구별 시차를 두는 공지
          // 기반 규칙"을 관리자가 수동 입력하도록 이미 확정돼 있고(1회성 시드
          // 스크립트로 채워둠), RCPTBGNDT가 이 카테고리에서도 그 규칙과 같은
          // 의미인지 확인된 바 없다(추측 금지) — 기존 결정과 충돌하지 않도록 이
          // 두 카테고리만 그대로 수동 입력 체계를 유지한다.
          const isManualOnlyKidsCafeCategory = categoryMin === '서울형키즈카페' || categoryMin === '공공키즈카페';
          const nextReservationOpenAt =
            !isManualOnlyKidsCafeCategory && reservationStartDateIso && new Date(reservationStartDateIso).getTime() > Date.now()
              ? reservationStartDateIso
              : null;

          const row = buildEventRow({
            externalId: `SEOUL_YEYAK_${item.SVCID}`,
            title: item.SVCNM,
            // [Decision 024(2026-09-11)] 체육시설/공간시설도 이제 이 events 분기를 함께
            // 지나가지만, "체험·클래스"(EVENTS_UI_CATEGORY)는 문화체험/교육강좌에만
            // 맞는 라벨이다 — 테니스장 대관/캠핑장 예약을 "체험·클래스"로 잘못 태깅하지
            // 않도록 이 둘은 예전 open_spaces 시절과 동일하게 uiCategory: null(→ETC)로
            // 남긴다(category_min은 이미 MINCLASSNM으로 정확히 채워지므로 실제 화면
            // 배지 표시에는 영향 없음 — Task 8-27 category_min 우선 표시 규약).
            uiCategory: isSpaceLikeMaxClass ? null : EVENTS_UI_CATEGORY,
            source: SOURCE,
            startDate,
            endDate,
            lng: hasCoords ? lng : null,
            lat: hasCoords ? lat : null,
            locationPrecision,
            isReservationRequired: true, // SEOUL_YEYAK 소스는 전건 "사전 예약 필수" 뱃지 기본 부여
            reservationUrl,
            reservationStartDate: reservationStartDateIso,
            reservationEndDate: reservationEndDateIso,
            nextReservationOpenAt,
            isFree: item.PAYATNM === '무료',
            thumbnailUrl: item.IMGURL || null,
            isActive: isActiveStatus(item.SVCSTATNM),
            // [Decision 024] 체육시설/공간시설이 이 events 분기로 옮겨왔다고 해서 Decision
            // 017 9항이 정한 "체육/공간시설의 키즈 뱃지는 넓은 텍스트 스캔이 아니라
            // USETGTINFO/MINCLASSNM 두 필드로만 판별"까지 되돌리면 안 된다(정확히 그
            // 오매핑을 정화하려던 결정이었다) — 이 둘만 계속 좁은 판별을 쓴다.
            isKidsFriendly: isSpaceLikeMaxClass
              ? deriveSpaceKidsFriendly({ useTargetInfo: item.USETGTINFO, minClassName: item.MINCLASSNM })
              : broadTags.is_kids_friendly,
            hasParking: broadTags.has_parking,
            strollerAccessible: broadTags.stroller_accessible,
            facilityType: broadTags.facility_type,
            targetAgeGroup: broadTags.target_age_group,
            venueName: item.PLACENM || null,
            sigunguName,
            rawData: item,
            // [상세보기 설명 누락 수정](2026-08-27): 이 소스는 본문 백필(backfill-contents.mjs)
            // 대상에서 빠져 description이 전량 NULL이었다(실측 확인) — 원본 DTLCONT(상세내용)에서
            // 공통 안내문/HTML 태그를 제거해 채운다.
            description: extractYeyakDescription(item.DTLCONT),
            categoryMin,
            categoryMinSource,
            // [가격 정보 파싱 고도화](2026-09-11 사용자 지시, todo.md 개선사항7-1): 이 소스는
            // 구조화된 가격 필드가 없어(PAYATNM은 유료/무료 구분뿐, 실측 확인) DTLCONT(상세
            // 안내문)에서 라벨+금액 패턴을 찾는다. reservation_url이 이제 SVCURL 값 그대로다
            // (2026-09-20 수정, 위 reservationUrl 참고)라 source_url을 별도로 중복 저장하지 않는다.
            // (2026-09-18) PAYATNM이 명시적으로 무료면 그 구조화된 신호를 우선한다(위 참고).
            priceText,
            targetAudience,
            targetAudienceSource: targetAudience ? 'RAW_FIELD' : null,
          });
          if (!row) {
            bumpError(errorCounts, 'SCHEMA_BUILD_FAIL');
            continue;
          }
          eventRows.push(row);
        } else {
          // [Decision 024(2026-09-11)로 현재는 도달 불가] MAXCLASSNM_TABLE의 4개 키가 전부
          // 'events'를 가리켜 이 분기는 지금 실행되지 않는다 — 삭제하지 않고 남겨둔 이유는
          // (1) 향후 MAXCLASSNM_TABLE에 open_spaces행 값이 다시 추가될 가능성을 완전히
          // 배제하지 않고, (2) 이 브랜치를 함께 검증하던 기존 테스트/이력을 그대로 보존하기
          // 위함이다(제5장 제4조 — 불필요한 대규모 삭제보다 최소 변경).
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
            categoryMin,
            categoryMinSource,
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
