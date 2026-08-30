// [스팟픽 나들이 전용 핵심 중분류 1단 필터 개편](2026-08-29 사용자 지시): 기존 대분류→중분류
// 2단 구조를 철회하고, 진짜 나들이/가족 방문 목적에 맞는 핵심 중분류만 1단 가로 칩으로
// 노출한다. 체육시설(테니스장/골프장 등)·행정/공공청사 대관류(강당/회의실/청년공간 등)처럼
// 비나들이성 항목은 필터 목록에서 완전히 제외한다.
//
// 하나의 칩이 실제 DB `category_min` 값 여러 개를 한 번에 아우르는 경우가 있다. 실제 DB
// 분포(`select category_min, count(*) from open_spaces group by category_min`)를 직접
// 확인해 존재하지 않는 값을 임의로 만들지 않았다 — "문화센터"라는 category_min은 실제로
// 없어 가장 가까운 실제 값인 '문화의집'/'문화원'으로 매핑했다.
//
// [행안부 놀이시설 설치장소코드 매핑 + 박물관/미술관 분리](2026-08-29 사용자 지시): 이전에는
// "박물관(미술관 포함)"으로 하나의 칩에 묶여 있었으나, 사용자 지시에 따라 박물관과 미술관을
// 별개 칩으로 분리한다. 또한 행안부 전국어린이놀이시설정보(pfc3, LOCALDATA_PLAYGROUND)의
// instlPlaceCd 매핑으로 새로 채워지는 '자연휴양림'/'육아종합지원센터'/'유아교육진흥원'
// category_min에 대응하는 칩을 추가한다(scripts/ingest/adapters/playground-adapter.mjs 참고).
// '캠핑장'(instlPlaceCd A032 야영장 매핑 대상)은 이번 사용자 지시에 신규 칩으로 명시되지
// 않아 필터 칩은 추가하지 않았다 — 데이터 자체는 계속 category_min='캠핑장'으로 적재된다.
//
// [키즈친화 식당 칩 누락 수정](2026-08-30 사용자 지시): "경기 키즈카페/놀이시설 휴게음식점
// 수집 어댑터 구축"(gg-kidscafe-adapter.mjs, GG_KIDSCAFE Resrestrtkidscafe API)이
// category_min='놀이방식당'(놀이시설을 갖춘 음식점 전체, 특정 업종으로 세분화하지 않고
// 소스 전체를 하나로 묶은 값 — 어댑터 주석 참고, is_kids_friendly=true 고정)으로 실제
// 1,788건을 이미 적재하고 있었는데, 이 필터 개편(2026-08-29) 당시 새 칩으로 추가되지
// 않아 스팟픽 화면에서 이 데이터를 중분류로 찾아볼 방법이 없었다(실측 확인). 신규 칩을
// 추가한다.
export type CoreSpotCategory = {
  id: string;
  label: string;
  emoji: string;
  // AI 추천 칩은 실제 category_min으로 필터링하는 게 아니라 별도 추천 로직(바텀시트)을
  // 여는 액션 버튼이라 minors가 빈 배열이다 — map-explorer.tsx가 이 값을 보고 일반 선택
  // 칩과 다르게 처리한다(selectedCategoryId로 선택하지 않고 onSelectAiRecommend만 호출).
  minors: string[];
};

export const AI_RECOMMEND_CATEGORY_ID = 'ai-recommend';

export const CORE_SPOT_CATEGORIES: CoreSpotCategory[] = [
  { id: AI_RECOMMEND_CATEGORY_ID, label: 'AI 추천', emoji: '✨', minors: [] },
  { id: 'park', label: '공원', emoji: '🌳', minors: ['공원'] },
  { id: 'culture-center', label: '문화센터/문화의집', emoji: '🏛️', minors: ['문화의집', '문화원'] },
  { id: 'museum', label: '박물관', emoji: '🏛️', minors: ['종합/기타박물관', '역사박물관'] },
  { id: 'art-museum', label: '미술관', emoji: '🖼️', minors: ['미술관'] },
  { id: 'library', label: '도서관', emoji: '📚', minors: ['도서관'] },
  { id: 'kids-cafe', label: '키즈카페', emoji: '☕', minors: ['키즈카페'] },
  { id: 'kids-restaurant', label: '키즈친화 식당', emoji: '🍽️', minors: ['놀이방식당'] },
  {
    id: 'playground',
    label: '놀이터',
    emoji: '🛝',
    minors: ['어린이놀이터', '어린이놀이시설(야외)', '어린이놀이시설(실내)'],
  },
  { id: 'nature-recreation-forest', label: '자연휴양림', emoji: '🌲', minors: ['자연휴양림'] },
  { id: 'childcare-support-center', label: '육아종합지원센터', emoji: '🍼', minors: ['육아종합지원센터'] },
  { id: 'early-childhood-education-center', label: '유아교육진흥원', emoji: '🎓', minors: ['유아교육진흥원'] },
];

export function isKnownSpotCategoryMin(value: string): boolean {
  return CORE_SPOT_CATEGORIES.some((c) => c.minors.includes(value));
}
