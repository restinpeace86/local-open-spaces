// [스팟픽 대분류/중분류 계층적 탐색](2026-08-28): 스팟픽(/nearby) 전용 공개 화면 대분류
// 체계다. 어드민 `category-min-groups.ts`(6개 대분류, 강당/회의실 등 시설 대관·행정류 포함)
// 를 그대로 재사용하지 않는다 — 그건 관리자가 모든 데이터를 검수하기 위한 목적이라 일반
// 유저가 나들이 스팟을 고를 때는 의미 없는 항목(강당/회의실/청년공간 등)이 섞여 있다.
// 이벤트픽 홈 화면의 `category-maj-meta.ts`와 동일한 원칙(공개 노출에 적합한 항목만 추림)을
// open_spaces에도 적용해, "공공청사 대관"/"기타" 그룹은 제외한 4개 대분류만 남긴다.
export type SpotCategoryGroup = { major: string; emoji: string; minors: string[] };

export const SPOT_CATEGORY_GROUPS: SpotCategoryGroup[] = [
  {
    major: '체육시설',
    emoji: '🏀',
    minors: [
      '테니스장', '골프장', '풋살장', '축구장', '농구장', '족구장', '체육관', '야구장',
      '다목적경기장', '배드민턴장', '탁구장', '배구장', '수영장', '운동장', '피클볼장',
    ],
  },
  {
    major: '문화시설',
    emoji: '🖼️',
    minors: ['공연장', '전시실', '도서관', '문화원', '문화의집', '미술관', '역사박물관', '종합/기타박물관', '과학관', '시민교육센터'],
  },
  {
    major: '자연/공원',
    emoji: '🌳',
    minors: ['공원', '생태공원', '수목원', '자연휴양림', '캠핑장', '광장', '역사유적지', '관광명소'],
  },
  {
    major: '키즈/놀이시설',
    emoji: '🛝',
    minors: ['어린이놀이터', '어린이놀이시설(야외)', '어린이놀이시설(실내)', '키즈카페', '바닥분수/물놀이시설', '체험학습장'],
  },
];

export function isKnownSpotCategoryMin(value: string): boolean {
  return SPOT_CATEGORY_GROUPS.some((g) => g.minors.includes(value));
}
