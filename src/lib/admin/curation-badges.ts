import { createElement, Fragment, type ReactNode } from 'react';

// [카테고리별 뱃지/룰 완전 독립 Config 구조](2026-09-07, implementation/todo.md
// 개선사항4 — 사용자 지시로 세부 방침 확정) — 예전엔 뱃지 목록이 "노출 중분류"와
// 무관하게 전역 단일 목록 하나였다(식당 기준). 그런데 실측 확인 결과 "노출
// 중분류" 드롭다운엔 이미 서로 성격이 다른 13개 값(키즈카페/실내놀이터, 캠핑장,
// 도서관, 박물관 등)이 실제로 존재했고, 이미 17건이 "키즈카페 / 실내놀이터"로
// 큐레이션돼 있으면서도 식당용 뱃지("좌식/온돌", "키즈 메뉴" 등)만 볼 수 있었다 —
// 실제 문제로 확인된 것을 이번에 고친다.
//
// 사용자 지시: "노출 중분류에 대하여 적용시 [전부] 같이 가도록 적용해야지..
// 하나씩 채워넣어야지 거기에 맞는거" — 13개(사용자는 "10개"라고 했으나 실측
// service_categories 실제 행 수는 13개, todo.md 자체의 [노출될 중분류] 참고
// 목록과도 정확히 일치해 그 수를 그대로 따른다) 전부를 이 배열에 등록해 구조는
// 처음부터 갖추되, 실제 콘텐츠(뱃지/키워드)가 확정된 것만 우선 채운다:
// - "키즈친화 식당(놀이시설 포함)": 기존 13개 뱃지 그대로(이미 83건 실사용 중,
//   변경하면 기존 데이터와 어긋남).
// - "키즈카페 / 실내놀이터": todo.md 원문이 예시로 준 키즈카페 전용 뱃지 세트
//   그대로 반영(트램폴린/볼풀장/베이비존 등).
// - 나머지 11개(도서관/박물관/캠핑장/휴양마을 등): 아직 실제 큐레이션 데이터도,
//   todo.md가 준 예시 콘텐츠도 없다 — venue 특유의 뱃지(예: 도서관에 "트램폴린")를
//   임의로 지어내지 않고(제3장 제5조 추측 금지), 어떤 공공장소에도 보편적으로
//   적용 가능한 최소 공통 항목(주차/유모차/수유실/기저귀대/예약 필수·가능)만
//   임시로 채워 둔다 — 관리자가 각 카테고리에 맞는 실제 뱃지를 하나씩 확정해
//   주면 그때 개별 교체한다("하나씩 채워넣어야지"라는 지시와 일치).
export type CurationBadgeOption = {
  key: string;
  label: string;
  group: string;
};

type CurationCategoryConfig = {
  categoryId: string;
  // service_categories.category_name과 정확히 일치하는 값들 — 이 목록에 속한
  // 노출 중분류를 고르면 이 config가 활성화된다.
  exposureCategoryNames: string[];
  badgeGroups: string[];
  badgeOptions: CurationBadgeOption[];
  // 뱃지 키 → 하이라이트/자동 체크용 키워드 목록.
  keywordGroups: Record<string, string[]>;
};

// [뱃지 목록 정정 이력](2026-09-05~06 사용자 지시) — "식당" config는 그 논의를
// 그대로 이어받는다: 12개 → 룸/개별공간 재합침 + 예약가능 추가로 13개 확정.
const RESTAURANT_KEYWORD_GROUPS: Record<string, string[]> = {
  parking: ['주차', '주차장', '파킹', '차댈곳', '발렛'],
  stroller: ['유모차', '유모차반입', '유모차동반'],
  nursing_room: ['수유실', '모유수유'],
  diaper_table: ['기저귀', '갈이대', '기저귀존'],
  kids_chair: ['아기의자', '하이체어', '유아용의자', '유아의자'],
  kids_tableware: ['유아식기', '식판', '아기식기'],
  kids_menu: ['키즈메뉴', '돈가스', '주먹밥', '어린이메뉴'],
  floor_seating: ['좌식', '온돌'],
  private_room: ['룸', '개별룸', '단독룸', '프라이빗룸'],
  kids_zone: ['키즈존', '놀이방', '장난감', '정글짐'],
  outdoor_yard: ['마당', '잔디밭', '테라스', '야외'],
  reservation_required: ['예약필수', '사전예약필수'],
  reservation_possible: ['예약', '사전예약', '캐치테이블', '네이버예약'],
};

const RESTAURANT_CONFIG: CurationCategoryConfig = {
  categoryId: 'restaurant',
  exposureCategoryNames: ['키즈친화 식당(놀이시설 포함)', '키즈친화 식당 (놀이시설 포함)'],
  badgeGroups: ['이동/편의', '식사/아기', '공간/놀이', '운영'],
  badgeOptions: [
    { key: 'parking', label: '주차 완비', group: '이동/편의' },
    { key: 'stroller', label: '유모차 가능', group: '이동/편의' },
    { key: 'nursing_room', label: '수유실 있음', group: '이동/편의' },
    { key: 'diaper_table', label: '기저귀 갈이대', group: '이동/편의' },
    { key: 'kids_chair', label: '아기의자', group: '식사/아기' },
    { key: 'kids_tableware', label: '유아 식기', group: '식사/아기' },
    { key: 'kids_menu', label: '키즈 메뉴', group: '식사/아기' },
    { key: 'floor_seating', label: '좌식/온돌 있음', group: '식사/아기' },
    { key: 'private_room', label: '룸/개별 공간 있음', group: '식사/아기' },
    { key: 'kids_zone', label: '키즈존/놀이방', group: '공간/놀이' },
    { key: 'outdoor_yard', label: '야외 마당/테라스', group: '공간/놀이' },
    { key: 'reservation_required', label: '예약 필수', group: '운영' },
    { key: 'reservation_possible', label: '예약 가능', group: '운영' },
  ],
  keywordGroups: RESTAURANT_KEYWORD_GROUPS,
};

// [키즈카페 전용 뱃지](2026-09-07 todo.md 개선사항4 원문 예시 그대로 반영) —
// 이 config가 활성화되면서 기존 17건의 "키즈카페 / 실내놀이터" 큐레이션의
// curation_badges는 식당용 값이 섞여 있어 사용자 지시대로 전부 초기화했다
// (별도 DB 마이그레이션, scripts/migrations/2026-09-07-reset-kidscafe-badges.sql).
const KIDS_CAFE_CONFIG: CurationCategoryConfig = {
  categoryId: 'kids_cafe',
  exposureCategoryNames: ['키즈카페 / 실내놀이터'],
  badgeGroups: ['이동/편의', '놀이/시설', '부대시설/보호자', '운영'],
  badgeOptions: [
    { key: 'kc_parking', label: '주차 완비', group: '이동/편의' },
    { key: 'kc_stroller_parking', label: '유모차 보관/가능', group: '이동/편의' },
    { key: 'kc_nursing_room', label: '수유실 있음', group: '이동/편의' },
    { key: 'kc_diaper_table', label: '기저귀 갈이대', group: '이동/편의' },
    { key: 'kc_trampoline', label: '트램폴린/방방', group: '놀이/시설' },
    { key: 'kc_ball_pool_jungle', label: '볼풀장/정글짐', group: '놀이/시설' },
    { key: 'kc_hinoki_sandbox', label: '편백존/모래놀이', group: '놀이/시설' },
    { key: 'kc_baby_zone', label: '베이비존(영유아 전용)', group: '놀이/시설' },
    { key: 'kc_parent_relax', label: '부모 쉼터/안마의자', group: '부대시설/보호자' },
    { key: 'kc_party_room', label: '파티룸/개별 룸', group: '부대시설/보호자' },
    { key: 'kc_food', label: '식사 및 간식 판매', group: '부대시설/보호자' },
    { key: 'kc_reservation_required', label: '예약 필수', group: '운영' },
    { key: 'kc_reservation_possible', label: '예약 가능', group: '운영' },
  ],
  keywordGroups: {
    kc_parking: ['주차', '주차장', '파킹', '차댈곳', '발렛'],
    kc_stroller_parking: ['유모차보관', '유모차파킹', '유모차'],
    kc_nursing_room: ['수유실', '모유수유'],
    kc_diaper_table: ['기저귀', '갈이대', '기저귀존'],
    kc_trampoline: ['트램폴린', '방방', '방방이', '점핑존', '점프'],
    kc_ball_pool_jungle: ['볼풀', '볼풀장', '정글짐', '클라이밍', '미끄럼틀'],
    kc_hinoki_sandbox: ['편백', '편백존', '편백나무', '모래놀이', '모래존'],
    kc_baby_zone: ['베이비존', '영유아존', '아기들노는곳', '돌쟁이'],
    kc_parent_relax: ['안마의자', '릴렉스존', '부모쉼터', '안마기', '안마'],
    kc_party_room: ['파티룸', '대관', '생일파티', '단독룸', '프라이빗룸'],
    kc_food: ['식사', '떡볶이', '주먹밥', '식음료', '음식맛집', '매점'],
    kc_reservation_required: ['예약필수', '사전예약필수', '회차별예약'],
    kc_reservation_possible: ['예약', '네이버예약', '전화예약'],
  },
};

// [보편 임시 뱃지](위 파일 상단 설명 참고) — 아직 전용 콘텐츠가 확정되지 않은
// 나머지 11개 노출 중분류에 공통으로 적용하는 최소 항목. venue별 특화 뱃지가
// 아니라 "어느 공공장소든 있을 법한" 편의시설만 담았다 — 임의로 지어낸 특화
// 항목(예: 도서관에 "볼풀장")은 없다.
const GENERIC_BADGE_GROUPS = ['이동/편의', '운영'];
const GENERIC_BADGE_OPTIONS: CurationBadgeOption[] = [
  { key: 'parking', label: '주차 완비', group: '이동/편의' },
  { key: 'stroller', label: '유모차 가능', group: '이동/편의' },
  { key: 'nursing_room', label: '수유실 있음', group: '이동/편의' },
  { key: 'diaper_table', label: '기저귀 갈이대', group: '이동/편의' },
  { key: 'reservation_required', label: '예약 필수', group: '운영' },
  { key: 'reservation_possible', label: '예약 가능', group: '운영' },
];
const GENERIC_KEYWORD_GROUPS: Record<string, string[]> = {
  parking: ['주차', '주차장', '파킹', '차댈곳', '발렛'],
  stroller: ['유모차', '유모차반입', '유모차동반'],
  nursing_room: ['수유실', '모유수유'],
  diaper_table: ['기저귀', '갈이대', '기저귀존'],
  reservation_required: ['예약필수', '사전예약필수'],
  reservation_possible: ['예약', '사전예약', '네이버예약'],
};

// [보편 임시 config 목록] — 사용자 지시대로 "노출 중분류 13개 전부"가 이 배열에
// 등록돼 있어야 한다. 실측 확인한 나머지 11개 노출 중분류(service_categories
// 실제 값) 각각에 위 보편 임시 뱃지를 연결한다.
const GENERIC_CATEGORY_NAMES = [
  '물놀이장 / 바닥분수 (시즌성)',
  '실내 체험·놀이 공간',
  '체험농장·농원',
  '휴양마을',
  '대형 근린공원 / 잔디광장',
  '생태공원 / 산책로',
  '수목원 / 식물원',
  '캠핑장 / 피크닉장',
  '어린이 도서관',
  '어린이 과학관 / 박물관',
  '미술관 / 전시체험관',
];

function slugifyCategoryName(name: string): string {
  return name.replace(/[^가-힣a-zA-Z0-9]/g, '');
}

const GENERIC_CONFIGS: CurationCategoryConfig[] = GENERIC_CATEGORY_NAMES.map((name) => ({
  categoryId: `generic_${slugifyCategoryName(name)}`,
  exposureCategoryNames: [name],
  badgeGroups: GENERIC_BADGE_GROUPS,
  badgeOptions: GENERIC_BADGE_OPTIONS,
  keywordGroups: GENERIC_KEYWORD_GROUPS,
}));

const CURATION_CATEGORIES: CurationCategoryConfig[] = [RESTAURANT_CONFIG, KIDS_CAFE_CONFIG, ...GENERIC_CONFIGS];

// 노출 중분류가 아직 선택되지 않았거나(신규 스팟) 어떤 config에도 매칭되지 않는
// 값이면 식당 기준으로 되돌린다 — 이 프로젝트에서 가장 먼저, 가장 많이(83건)
// 실사용 중인 카테고리라 기존 동작과 호환된다.
const DEFAULT_CATEGORY_ID = RESTAURANT_CONFIG.categoryId;

export function resolveCurationCategoryId(exposureCategoryName: string | null | undefined): string {
  if (!exposureCategoryName) return DEFAULT_CATEGORY_ID;
  const found = CURATION_CATEGORIES.find((c) => c.exposureCategoryNames.includes(exposureCategoryName));
  return found ? found.categoryId : DEFAULT_CATEGORY_ID;
}

function getCategoryConfig(categoryId: string): CurationCategoryConfig {
  return CURATION_CATEGORIES.find((c) => c.categoryId === categoryId) ?? RESTAURANT_CONFIG;
}

export function getBadgeGroupsForCategory(categoryId: string): string[] {
  return getCategoryConfig(categoryId).badgeGroups;
}

export function getBadgeOptionsForCategory(categoryId: string): CurationBadgeOption[] {
  return getCategoryConfig(categoryId).badgeOptions;
}

export function isKnownCurationBadgeKey(categoryId: string, key: string): boolean {
  return getCategoryConfig(categoryId).badgeOptions.some((opt) => opt.key === key);
}

// 정규식 특수문자가 섞인 키워드는 없지만(전부 한글), 방어적으로 이스케이프한다.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// [공백 무시 매칭](2026-09-07 개선사항3 2번): "아기의자", "아기 의자", "아 기 의 자"를
// 모두 동일하게 매칭하기 위해 키워드의 각 글자 사이에 선택적 공백(\s*)을 끼워 넣는다.
function toWhitespaceInsensitivePattern(keyword: string): string {
  return [...keyword].map(escapeRegExp).join('\\s*');
}

// 정규식에서 캡처 그룹으로 감싼 부분만 split() 결과에 원본 매칭 텍스트로 남는다 —
// 이 매칭 텍스트를 어느 원래 키워드(공백 유무와 무관하게 정규화한 키)가 낳았는지
// 되짚어야 뱃지 자동 체크(4번)에 쓸 수 있다. 공백을 전부 제거한 값을 정규화 키로
// 쓴다(원래 키워드도 공백이 없으므로 서로 일치).
function normalizeForLookup(value: string): string {
  return value.replace(/\s+/g, '');
}

// 카테고리별 "정규화 키워드 → 뱃지 키" 역참조 맵과 하이라이트 정규식을 지연
// 생성 후 캐시한다(카테고리 수만큼 매번 다시 만들 필요 없음).
const keywordLookupCache = new Map<string, Map<string, string>>();
const highlightRegexCache = new Map<string, RegExp>();

function getKeywordToBadgeKeyMap(categoryId: string): Map<string, string> {
  const cached = keywordLookupCache.get(categoryId);
  if (cached) return cached;
  const map = new Map<string, string>();
  for (const [badgeKey, keywords] of Object.entries(getCategoryConfig(categoryId).keywordGroups)) {
    for (const keyword of keywords) map.set(normalizeForLookup(keyword), badgeKey);
  }
  keywordLookupCache.set(categoryId, map);
  return map;
}

// 길이가 긴 키워드부터 매칭해야 "유모차반입"이 "유모차"에 가려 앞부분만 하이라이트되는
// 것을 방지한다(예: "유모차반입" 전체가 아니라 "유모차"만 마킹되는 사고 방지). 정규식
// 대체(|)는 나열 순서대로 첫 매칭을 채택하므로, 원래(공백 없는) 키워드 길이 기준으로
// 정렬하면 공백 삽입 매칭에서도 동일한 우선순위가 유지된다.
function getHighlightRegex(categoryId: string, extraKeywords: string[] = []): RegExp {
  if (extraKeywords.length === 0) {
    const cached = highlightRegexCache.get(categoryId);
    if (cached) return cached;
  }
  const categoryKeywords = Object.values(getCategoryConfig(categoryId).keywordGroups).flat();
  const all = [...categoryKeywords, ...extraKeywords];
  const sorted = [...all].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${sorted.map(toWhitespaceInsensitivePattern).join('|')})`, 'g');
  if (extraKeywords.length === 0) highlightRegexCache.set(categoryId, regex);
  return regex;
}

// 순수 텍스트 배열로 쪼갠 뒤, 매칭된 조각만 <mark>로 감싼 React 노드 배열을 만든다.
// 블로그 본문은 외부(크롤링) 출처라 dangerouslySetInnerHTML로 렌더링하면 XSS 위험이
// 있다 — React가 문자열 자식을 자동으로 이스케이프하는 이 방식이 안전하다.
// [카테고리별 실시간 전환](2026-09-07 개선사항4): categoryId가 바뀌면(관리자가
// 노출 중분류 콤보박스를 바꾸면) 그 카테고리의 키워드만으로 다시 하이라이트한다 —
// 서버 재요청 없이 클라이언트에서 즉시 재계산된다.
// [지역/지점명 동시 하이라이팅](2026-09-07 개선사항3 3번): extraKeywords로 뱃지
// 키워드가 아닌 임의 키워드(지역명 등)도 같은 방식(공백 무시 포함)으로 하이라이트.
export function highlightKeywords(text: string, categoryId: string = DEFAULT_CATEGORY_ID, extraKeywords: string[] = []): ReactNode {
  if (!text) return text;
  const regex = getHighlightRegex(categoryId, extraKeywords);
  const parts = text.split(regex);
  // split()은 홀수 인덱스에 캡처 그룹 매칭 결과를, 짝수 인덱스에 그 사이 일반 텍스트를
  // 담는다 — 매칭인지 여부를 정규식 재실행으로 다시 판정하지 않고 인덱스 패리티로
  // 안전하게 구분한다(빈 문자열 조각을 우연히 알려진 키워드로 오인하는 것도 방지).
  return createElement(
    Fragment,
    null,
    ...parts.map((part, i) =>
      i % 2 === 1
        ? createElement('mark', { key: i, style: { backgroundColor: '#fef08a' } }, part)
        : part
    )
  );
}

// [키워드 하이라이팅에 따른 뱃지 자동 체크](2026-09-07 개선사항3 4번): "블로그 본문 및
// 하이라이트 데이터를 기반으로 관련 뱃지가 1차로 자동 체크(Pre-check)되도록" — 본문
// 텍스트에서 실제로 매칭된 키워드들을 훑어 어느 뱃지가 걸리는지 Set으로 돌려준다.
// 관리자는 이 결과를 보고 문맥상 아니다 싶으면 클릭 한 번으로 체크 해제하면 된다
// (세미오토 검수 — 실제 체크박스 상태 반영은 호출부인 useSpotCurationForm이 담당).
// [카테고리별 독립 판정](2026-09-07 개선사항4): 현재 선택된 노출 중분류의 config
// 기준으로만 판정한다 — 카테고리를 바꾸면 자동 체크 결과도 그 카테고리 기준으로
// 달라진다.
export function matchBadgeKeysFromText(text: string, categoryId: string = DEFAULT_CATEGORY_ID): Set<string> {
  const matched = new Set<string>();
  if (!text) return matched;
  const regex = getHighlightRegex(categoryId);
  const hits = text.match(regex) ?? [];
  const keywordToBadgeKey = getKeywordToBadgeKeyMap(categoryId);
  for (const hit of hits) {
    const badgeKey = keywordToBadgeKey.get(normalizeForLookup(hit));
    if (badgeKey) matched.add(badgeKey);
  }
  return matched;
}
