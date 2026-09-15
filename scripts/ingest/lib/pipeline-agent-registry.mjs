// [파이프라인 로그 DB화](2026-09-15 사용자 지시, implementation/todo.md [개선사항 3]):
// "각 데이터 수집 에이전트가 어디에서 어떤 데이터를 가져오고 언제 실행되는지" 관리자
// 화면에 보여주기 위한 단일 출처(single source of truth) 레지스트리. run-daily.mjs/
// run-monthly.mjs의 sourceKey/label 문자열과 여기 키가 100% 일치해야 한다 — 새 소스를
// 추가할 때 이 파일에 등록을 깜빡하면(agent_name/description/period 불일치) 관리자
// 화면에서 바로 눈에 띄도록, 등록되지 않은 sourceKey는 조용히 숨기지 않고 description을
// null로, period를 '(미등록)'으로 그대로 노출한다(getAgentMeta 참고).
//
// [사용자 지적 사항] "Monthly에 GG_EVENTS로 된 소스가 있는데.. 이게 뭔지 왜 이벤트성
// 원천소스같은 이름으로 보이는데 monthly로 가져오고 있는지" — 실제로는 공공 수영장 +
// 물놀이형 수경시설(상시 시설, open_spaces)을 수집하는 소스라 이름이 오해를 부른다.
// DB에 이미 적재된 open_spaces.source 값('gg_public')은 건드리지 않고(데이터 마이그레이션
// 불필요, 무관한 값), 오케스트레이션/로깅 전용 식별자(sourceKey)만 명확한 이름으로
// 바꿨다 — gg-events-adapter.mjs와 run-monthly.mjs의 'GG_EVENTS' → 'GG_SWIMMING_POOL'.
export const PIPELINE_AGENTS = {
  // [daily/monthly 공용] 배치 시작 전 필수 환경변수 점검 — 하나라도 없으면 배치 전체를
  // 시작하지 않고 즉시 실패로 기록한다.
  ENV_PRECHECK: {
    description: '배치 시작 전 필수 환경변수(Supabase/공공데이터 API 키 등) 점검',
    period: 'daily',
  },
  // ── Daily: 시한성 이벤트(events) 원천 수집 ──
  GG_CULTURE_EVENTS: {
    description: '경기데이터드림 문화행사/공연 통합 수집(경기도 문화행사 현황 + 경기문화재단 행사 프로그램)',
    period: 'daily',
  },
  SEOUL_CULTURE_EVENTS: {
    description: '서울시 문화행사 정보(data.seoul.go.kr culturalEventInfo)',
    period: 'daily',
  },
  TOUR_API_FESTIVAL: {
    description: '한국관광공사 TourAPI 4.0 축제/행사 정보(searchFestival2)',
    period: 'daily',
  },
  SEOUL_YEYAK: {
    description: '서울시 공공서비스예약 통합 API(문화체험/교육강좌/체육시설/공간시설 예약형 프로그램, events+open_spaces 분리 적재)',
    period: 'daily',
  },
  // ── Daily: 수집 직후 후처리 ──
  GG_CULTURE_LOCATION_ENRICHMENT: {
    description: 'GG_CULTURE_EVENTS가 CITY_APPROX/UNKNOWN 정밀도로 남긴 좌표를 EXACT로 승격 보강(신규 적재 아님)',
    period: 'daily',
  },
  CATEGORY_RULES_APPLICATION: {
    description: 'category_min이 비어 있는 신규/기존 행에 최신 category_rules 키워드 규칙 재적용',
    period: 'daily',
  },
  DETAILED_CATEGORY_FALLBACK: {
    description: 'CATEGORY_RULES_APPLICATION 이후에도 남은 8개 특정 source_type의 미분류 행을 "기타"로 채움',
    period: 'daily',
  },
  LEGACY_SOURCE_CATEGORY_MAPPING: {
    description: '레거시 소스의 category_min 매핑 보정',
    period: 'daily',
  },
  DEACTIVATE_EXPIRED_EVENTS: {
    description: '종료일이 지난 events를 is_active=false로 일괄 비활성화',
    period: 'daily',
  },
  AUTO_ASSIGN_TO_EXISTING_GROUPS: {
    description: '신규 open_spaces를 좌표 근접 기준으로 기존 스팟 그룹에 자동 편입',
    period: 'daily',
  },
  MATCH_EVENTS_TO_OPEN_SPACES: {
    description: 'events를 좌표/명칭 기준으로 연결 가능한 open_spaces와 매칭(상세 팝업 "장소 이동" 기능용)',
    period: 'daily',
  },
  DELETE_EXPIRED_RESERVATION_SPACES: {
    description: '예약 기간이 종료된 임시성 예약 스팟(open_spaces) 정리',
    period: 'daily',
  },
  // [daily/monthly 공용] run-daily.mjs와 run-monthly.mjs 양쪽 다 자체 sourceKey로 이
  // 후처리 함수를 돌린다 — 실제 로그 행의 period는 어느 배치가 실행했는지에 따라 달라지며
  // (batch-log.mjs가 batchName으로 실시간 판정), 아래 period 값은 이 레지스트리가 실제로
  // 참조되는 description 필드의 보조 문서일 뿐 로그 기록에는 쓰이지 않는다.
  ANALYZE_OPEN_SPACES: {
    description: '대량 upsert 직후 stale된 open_spaces 쿼리 플래너 통계 갱신(ANALYZE, daily/monthly 공용)',
    period: 'daily',
  },
  REFRESH_SIGUNGU_OPTIONS_CACHE: {
    description: '시군구 필터 옵션 materialized view 갱신',
    period: 'daily',
  },
  REFRESH_EVENTS_FILTER_OPTIONS_CACHE: {
    description: '이벤트픽 필터 옵션 materialized view 갱신',
    period: 'daily',
  },
  REHOST_EVENT_THUMBNAILS: {
    description: '외부 원천 URL로 남아있는 events.thumbnail_url을 다운로드→400px 리사이징→Supabase Storage로 재호스팅(하루 최대 100건)',
    period: 'daily',
  },
  DEDUPE_OPEN_SPACES: {
    description: '좌표/명칭 유사도 기준 open_spaces 중복 행 정리(daily/monthly 공용)',
    period: 'daily',
  },

  // ── Monthly: 상시 시설(open_spaces) 원천 수집 ──
  CITY_PARK: {
    description: '전국 도시공원 정보 표준데이터(data.go.kr)',
    period: 'monthly',
  },
  CULTURE_FACILITY: {
    description: '서울시 문화공간 정보',
    period: 'monthly',
  },
  CULTURAL_FACILITY_SUMMARY: {
    description: '한국문화정보원 전국문화기반시설총람(박물관/미술관/공공도서관 등 8개 시설유형)',
    period: 'monthly',
  },
  LOCALDATA_AMUSEMENT: {
    description: '행정안전부 문화_테마파크업(기타) 인허가 정보',
    period: 'monthly',
  },
  // [사용자 지적 사항 대응] 과거 명칭 'GG_EVENTS' → 명확화(위 파일 헤더 설명 참고).
  GG_SWIMMING_POOL: {
    description: '경기데이터드림 공공 수영장 + 물놀이형 수경시설(바닥분수) 통합 수집(상시 시설, 구 명칭 GG_EVENTS)',
    period: 'monthly',
  },
  GG_KIDSCAFE: {
    description: '경기데이터드림 키즈카페 + 놀이시설 포함 휴게음식점 통합 수집',
    period: 'monthly',
  },
  GO_CAMPING: {
    description: '한국관광공사 고캠핑 정보 서비스',
    period: 'monthly',
  },
  NATIONAL_PARK_ECOTOUR: {
    description: '국립공원공단 국립공원 생태관광정보 DB',
    period: 'monthly',
  },
  LOCALDATA_PLAYGROUND: {
    description: '행정안전부 어린이놀이시설 인허가 정보',
    period: 'monthly',
  },
  PUBLIC_FACILITY_OPEN: {
    description: '전국공공시설개방표준데이터',
    period: 'monthly',
  },
  SWIMMING_POOL: {
    description: '전국 수영장(공공+민간 인허가) 통합 수집',
    period: 'monthly',
  },
  KOR_TOUR: {
    description: '한국관광공사 국문 관광정보 서비스(KorService2) 마스터 DB',
    period: 'monthly',
  },
  KOR_WITH_TOUR: {
    description: '한국관광공사 무장애 여행 정보 서비스',
    period: 'monthly',
  },
  KOR_PET_TOUR: {
    description: '한국관광공사 반려동물 동반여행 서비스',
    period: 'monthly',
  },
  RURAL_EXPERIENCE_VILLAGE: {
    description: '전국농어촌체험휴양마을 표준데이터',
    period: 'monthly',
  },
  RURAL_EDUCATION_FARM: {
    description: '농촌진흥청 농촌교육농장(농사로)',
    period: 'monthly',
  },
  PLAYGROUND_INSTALL_PLACE_MAPPING: {
    description: 'LOCALDATA_PLAYGROUND의 설치장소코드(instlPlaceCd) 기준 category_min 백필(신규 적재 아님)',
    period: 'monthly',
  },
};

export function getAgentMeta(sourceKey) {
  return PIPELINE_AGENTS[sourceKey] ?? { description: null, period: null };
}
