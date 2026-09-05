// [스팟픽 나들이 전용 핵심 중분류 1단 필터 개편](2026-08-28~29 사용자 지시): 기존 대분류→중분류
// 2단 구조를 철회하고, 진짜 나들이/가족 방문 목적에 맞는 핵심 중분류만 1단 가로 칩으로
// 노출했었다. 체육시설(테니스장/골프장 등)·행정/공공청사 대관류(강당/회의실/청년공간 등)처럼
// 비나들이성 항목은 계속 필터 목록에서 완전히 제외한다.
//
// [todo.md 개선사항 6](2026-09-03 사용자 지시): "작년 8월 디자인(플랫 단일 탭) 대신, 4대
// 대분류 탭 + 클릭 시 바텀시트로 하위 중분류 노출 구조로 가는 것이 맞다"는 명시적 확인에
// 따라 1단 구조를 다시 2단(대분류→중분류 바텀시트)으로 전환한다. 다만 하위 호환을 위해
// `CORE_SPOT_CATEGORIES` 자체는 계속 평평한 배열로 유지한다(spot-curations-panel.tsx/
// map-explorer.tsx가 이미 `.find(c => c.id === ...)` 형태로 이 배열을 직접 참조하고
// 있어 구조를 트리로 바꾸면 그 소비처들을 전부 고쳐야 한다 — 제5장 제4조 기존 구조
// 우선). 대신 각 항목에 `major` 필드만 추가하고, 대분류별로 묶어보는 조회는
// `getSpotCategoriesByMajor` 헬퍼로 파생한다.
//
// 대분류 구성 4종(요구사항 원문 순서 그대로: 키즈/놀이시설 → 농장/체험 → 자연/공원 →
// 문화시설)에 맞춰, 기존 11개 핵심 중분류를 재배치하고, 실측 DB 분포(`select category_min,
// count(*) from open_spaces where location_precision='EXACT' group by category_min`)에서
// 확인된 미노출 항목 중 그 목적이 명확한 것들을 추가로 편입했다:
//   - 농장/체험: 기존엔 이 대분류에 해당하는 칩이 하나도 없었다. get-home-feed.ts의
//     SHARED_OPEN_SPACES_CATEGORY_MINS(캠핑장/체험휴양마을/교육농장/체험학습장)가 이미
//     이벤트픽 "체험 / 농장" 대분류로 검증된 동일 개념이라 그대로 재사용한다.
//   - 그 외 신규 편입(수목원/생태공원/전시실/공연장/과학관/역사유적지/물놀이시설)은
//     전부 목적이 모호하지 않고(제3장 제5조 추측 금지 회피) 실제 카운트도 유의미하다
//     (49~495건).
//
// [스팟픽 표준 중분류 동기화](2026-09-05 사용자 지시): "현재 관리자에 있는 표준 중분류를
// 스팟픽에서 안쓰는거 같음.. 관리자쪽과 표준중분류 일치시켜줘. 단.. 대분류 - 체육시설,
// 공공청사 대관, 기타는 제외시켜줘." — src/lib/admin/category-min-groups.ts의
// OPEN_SPACES_GROUPS_STATIC(어드민이 실제로 쓰는 표준 대분류/중분류 정의)을 기준 진실로
// 삼아, 그중 요청대로 제외한 3개 대분류(체육시설/공공청사 대관/기타)를 뺀 나머지 4개
// 대분류(키즈/놀이시설/농장/체험/자연/공원/문화시설)의 중분류 목록을 그대로 맞췄다.
// 이 동기화로 바뀐 배정(어드민 기준이 이 파일의 기존 배정과 달랐던 3건):
//   - 캠핑장: 농장/체험 → 자연/공원 (어드민은 캠핑을 "자연 활동"으로 분류)
//   - 체험학습장: 농장/체험 → 키즈/놀이시설 (어드민은 어린이 체험시설로 분류)
//   - 역사유적지: 문화시설 → 자연/공원 (어드민은 야외 유적지를 자연/공원으로 분류)
// 그 결과 "농장/체험" 대분류는 어드민과 동일하게 체험휴양마을/교육농장 2종만 남는다
// (2026-08-29 당시 이 파일이 독자적으로 편입했던 캠핑장/체험학습장은 어드민 기준과
// 어긋났던 것으로 확인돼 제거). 신규 편입 3종(시민교육센터/광장/관광명소)도 어드민
// 정의를 그대로 따른다 — "관광명소"는 이전엔 목적이 모호하다는 이유로 의도적으로
// 제외했었지만, 이번 사용자 지시가 "일단 관리자쪽과 일치"를 명시적으로 우선했으므로
// 어드민 정의를 그대로 따른다(더 큐레이션하고 싶다면 어드민 쪽 정의부터 바꿔야 두
// 화면이 다시 어긋나지 않는다).
// spot-category-groups.test.ts가 OPEN_SPACES_GROUPS_STATIC을 직접 참조해 두 파일이
// 다시 벌어지면 실패하는 교차 검증 테스트를 둔다.
export type SpotMajorCategoryId = 'kids-play' | 'farm-experience' | 'nature-park' | 'culture-facility';

export const SPOT_MAJOR_CATEGORY_OPTIONS: { id: SpotMajorCategoryId; label: string; emoji: string }[] = [
  { id: 'kids-play', label: '키즈/놀이시설', emoji: '🧸' },
  { id: 'farm-experience', label: '농장/체험', emoji: '🌱' },
  { id: 'nature-park', label: '자연/공원', emoji: '🌳' },
  { id: 'culture-facility', label: '문화시설', emoji: '🏛️' },
];

export type CoreSpotCategory = {
  id: string;
  label: string;
  emoji: string;
  // AI 추천 칩은 실제 category_min으로 필터링하는 게 아니라 별도 추천 로직(바텀시트)을
  // 여는 액션 버튼이라 minors가 빈 배열이고 major도 없다(어느 대분류 탭에도 속하지 않는
  // 별도 액션 버튼으로 노출된다) — map-explorer.tsx가 이 값을 보고 일반 선택 칩과
  // 다르게 처리한다(selectedCategoryId로 선택하지 않고 onSelectAiRecommend만 호출).
  minors: string[];
  major: SpotMajorCategoryId | null;
};

export const AI_RECOMMEND_CATEGORY_ID = 'ai-recommend';

export const CORE_SPOT_CATEGORIES: CoreSpotCategory[] = [
  { id: AI_RECOMMEND_CATEGORY_ID, label: 'AI 추천', emoji: '✨', minors: [], major: null },

  // 🧸 키즈/놀이시설
  {
    id: 'playground',
    label: '놀이터',
    emoji: '🛝',
    minors: ['어린이놀이터', '어린이놀이시설(야외)', '어린이놀이시설(실내)'],
    major: 'kids-play',
  },
  { id: 'kids-cafe', label: '키즈카페', emoji: '☕', minors: ['키즈카페'], major: 'kids-play' },
  { id: 'kids-restaurant', label: '키즈친화 식당', emoji: '🍽️', minors: ['놀이방식당'], major: 'kids-play' },
  { id: 'water-play', label: '물놀이시설', emoji: '💦', minors: ['바닥분수/물놀이시설'], major: 'kids-play' },
  {
    id: 'childcare-support-center',
    label: '육아종합지원센터',
    emoji: '🍼',
    minors: ['육아종합지원센터'],
    major: 'kids-play',
  },
  {
    id: 'early-childhood-education-center',
    label: '유아교육진흥원',
    emoji: '🎓',
    minors: ['유아교육진흥원'],
    major: 'kids-play',
  },
  // [표준 중분류 동기화](2026-09-05): 어드민 기준 체험학습장은 "농장/체험"이 아니라
  // "키즈/놀이시설" 소속이다(위 상단 코멘트 참고).
  {
    id: 'experience-learning-center',
    label: '체험학습장',
    emoji: '🔬',
    minors: ['체험학습장'],
    major: 'kids-play',
  },

  // 🌱 농장/체험 — [표준 중분류 동기화](2026-09-05) 어드민 기준 이 대분류는 체험휴양마을/
  // 교육농장 2종뿐이다(캠핑장은 자연/공원으로, 체험학습장은 키즈/놀이시설로 이동).
  {
    id: 'rural-experience-village',
    label: '체험휴양마을',
    emoji: '🏘️',
    minors: ['체험휴양마을'],
    major: 'farm-experience',
  },
  { id: 'education-farm', label: '교육농장', emoji: '🌾', minors: ['교육농장'], major: 'farm-experience' },

  // 🌳 자연/공원
  { id: 'park', label: '공원', emoji: '🌳', minors: ['공원'], major: 'nature-park' },
  {
    id: 'nature-recreation-forest',
    label: '자연휴양림',
    emoji: '🌲',
    minors: ['자연휴양림'],
    major: 'nature-park',
  },
  { id: 'arboretum', label: '수목원', emoji: '🌴', minors: ['수목원'], major: 'nature-park' },
  { id: 'eco-park', label: '생태공원', emoji: '🦆', minors: ['생태공원'], major: 'nature-park' },
  // [표준 중분류 동기화](2026-09-05): 어드민 기준 캠핑장/역사유적지는 자연/공원 소속이다.
  { id: 'camping', label: '캠핑장', emoji: '🏕️', minors: ['캠핑장'], major: 'nature-park' },
  { id: 'historic-site', label: '역사/유적', emoji: '🏯', minors: ['역사유적지'], major: 'nature-park' },
  // [표준 중분류 동기화](2026-09-05) 신규 편입: 어드민 정의를 그대로 따른다(상단 코멘트 참고).
  { id: 'plaza', label: '광장', emoji: '🏙️', minors: ['광장'], major: 'nature-park' },
  { id: 'tourist-attraction', label: '관광명소', emoji: '📍', minors: ['관광명소'], major: 'nature-park' },

  // 🏛️ 문화시설
  {
    id: 'culture-center',
    label: '문화센터/문화의집',
    emoji: '🏛️',
    minors: ['문화의집', '문화원'],
    major: 'culture-facility',
  },
  {
    id: 'museum',
    label: '박물관',
    emoji: '🏛️',
    minors: ['종합/기타박물관', '역사박물관'],
    major: 'culture-facility',
  },
  { id: 'art-museum', label: '미술관', emoji: '🖼️', minors: ['미술관'], major: 'culture-facility' },
  { id: 'library', label: '도서관', emoji: '📚', minors: ['도서관'], major: 'culture-facility' },
  { id: 'exhibition-hall', label: '전시실', emoji: '🖼️', minors: ['전시실'], major: 'culture-facility' },
  { id: 'performance-hall', label: '공연장', emoji: '🎭', minors: ['공연장'], major: 'culture-facility' },
  { id: 'science-museum', label: '과학관', emoji: '🔬', minors: ['과학관'], major: 'culture-facility' },
  // [표준 중분류 동기화](2026-09-05) 신규 편입.
  { id: 'civic-education-center', label: '시민교육센터', emoji: '🏫', minors: ['시민교육센터'], major: 'culture-facility' },
];

// [todo.md 개선사항 6](2026-09-03): 대분류 탭 클릭 시 바텀시트에 노출할 하위 중분류
// 목록을 파생한다 — CORE_SPOT_CATEGORIES 자체는 계속 평평하게 유지하므로(위 주석 참고)
// 이 함수는 순수 필터일 뿐 새 데이터 구조를 만들지 않는다.
export function getSpotCategoriesByMajor(major: SpotMajorCategoryId): CoreSpotCategory[] {
  return CORE_SPOT_CATEGORIES.filter((c) => c.major === major);
}

// [todo.md 개선사항 6](2026-09-03) "바텀시트 내에서 나오는 중분류에 대하여 데이터가 0건인
// 중분류는 중분류항목에서 제외할 것": 칩 하나가 여러 category_min을 아우를 수 있어
// (예: "박물관" = 종합/기타박물관 + 역사박물관), 그중 하나라도 실제 데이터가 있으면 그
// 칩은 유효하다(.some()) — counts가 없으면(아직 조회 전) 전부 노출해 안전하게 폴백한다.
export function isSpotCategoryVisible(category: CoreSpotCategory, counts?: Record<string, number>): boolean {
  if (!counts) return true;
  return category.minors.some((min) => (counts[min] ?? 1) > 0);
}

export function isKnownSpotCategoryMin(value: string): boolean {
  return CORE_SPOT_CATEGORIES.some((c) => c.minors.includes(value));
}
