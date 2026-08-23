// Task 9-6-6(2026-08-23): "/events/today" 전용 지역 계층 피딩(1순위 구/시 → 2순위 상위 시 →
// 3순위 도/특별시, 그 외 완전 차단)에 쓰는 지역 옵션과 소속 시/군/구 고정 목록.
// 대한민국 공식 행정구역 명칭 그대로라 추측이 아니다(제3장 제5조와 무관) — Node 스크립트
// 쪽의 scripts/ingest/adapters/gg-culture-events-adapter.mjs GYEONGGI_SIGUN_NAMES와 동일한
// 성격의 고정 사실 표다. 두 곳은 서로 다른 런타임(Next.js TS 앱 vs 독립 Node mjs 인제스트
// 스크립트)이라 공유 모듈로 묶지 않는다(기존에도 이 프로젝트 전반에서 scripts/와 src/는
// import를 주고받지 않는 관례 — 제5장 제4조 위반이 아니라 두 빌드 타깃의 분리를 유지하는 것).
export const GYEONGGI_SIGUN_NAMES = [
  '수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시', '안산시', '고양시',
  '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인시', '파주시',
  '이천시', '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군',
] as const;

// 서울특별시 25개 자치구 — 서울은 경기도와 달리 "시" 중간 계층 없이 도/특별시 바로 아래가
// 구(區)다(sigungu_name 토큰화 규칙상 broad 토큰이 없는 단일 토큰 지역이 되는 이유).
export const SEOUL_GU_NAMES = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구',
  '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구',
  '관악구', '서초구', '강남구', '송파구', '강동구',
] as const;

export type RegionOption = {
  key: string;
  label: string;
  sigunguName: string;
  provinceMembers: readonly string[];
};

// 지시서 예시 그대로 2개 옵션을 기본 제공한다(성남시 분당구가 기본/1순위 예시). 새 지역을
// 추가하려면 이 배열에 항목만 더하면 되는 구조라 확장에 열려 있다(제7장 제7조 — 확장 기능
// 자체를 미리 만들지는 않되 구조는 막지 않는다).
export const REGION_OPTIONS: readonly RegionOption[] = [
  { key: 'seongnam-bundang', label: '성남시 분당구', sigunguName: '성남시 분당구', provinceMembers: GYEONGGI_SIGUN_NAMES },
  { key: 'seoul-seocho', label: '서울시 서초구', sigunguName: '서초구', provinceMembers: SEOUL_GU_NAMES },
];

export const DEFAULT_REGION_OPTION: RegionOption = REGION_OPTIONS[0];

export function findRegionOption(key: string | null | undefined): RegionOption {
  return REGION_OPTIONS.find((option) => option.key === key) ?? DEFAULT_REGION_OPTION;
}

// Task 9-6-7(2026-08-23): "성남시 분당구" 설정 시 메인 피드/가성비 행복 섹션에 "서울형
// 키즈카페 서초구 양재1동2호점" 같은 서울시 데이터가 섞여 나오던 버그의 원인 — get-home-feed.ts의
// getTodayEvents/getFreeFeed는 HomeRegion.provinceMembers를 명시적으로 넘긴 호출부(/events/today)
// 에서만 3순위 조회가 도/특별시 경계로 제한되고, provinceMembers를 넘기지 않는 기존 호출부
// (Hero Carousel의 DEFAULT_HOME_REGION, 가성비 행복 섹션)는 여전히 "지역 제한 없는 전체 조회"로
// 폴백해 타 지자체 데이터가 그대로 후보군에 들어왔다. 매 호출부가 provinceMembers를 일일이
// 넘기도록 강제하는 대신(넘기는 걸 잊으면 똑같은 버그가 재발함), sigunguName만으로 소속 도/
// 특별시를 자동 판별해 fetchRegionFirstRows 내부에서 항상 적용되도록 한다 — 호출부가 무엇을
// 넘기든 안전하게 차단된다. 인식 불가능한(경기도/서울 어느 목록에도 없는) sigunguName은
// undefined를 반환해 기존처럼 지역 제한 없는 폴백을 유지한다(이 서비스가 아직 다루지 않는
// 지역을 임의로 차단하지 않음 — 추측 금지).
export function resolveProvinceMembers(sigunguName: string | null | undefined): readonly string[] | undefined {
  if (!sigunguName) return undefined;
  if (GYEONGGI_SIGUN_NAMES.some((name) => sigunguName.includes(name))) return GYEONGGI_SIGUN_NAMES;
  if (SEOUL_GU_NAMES.some((name) => sigunguName.includes(name))) return SEOUL_GU_NAMES;
  return undefined;
}
