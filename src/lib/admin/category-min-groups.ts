// [대분류/중분류 계층적 탐색 UI](2026-08-28): `/admin/data-grid`의 표준 중분류(category_min)
// 체크박스가 50종 내외로 늘어나 한 화면에 flat하게 펼쳐지면 지저분해지는 문제를 해결한다.
// 여기서 정의하는 "대분류"는 이 어드민 필터 UI 전용 그룹핑이다 — 홈 화면 이벤트픽의
// `category-maj-meta.ts`(7대 대분류)는 공개 화면에 노출할 항목만 추린 부분집합이라(관리
// 전용/시설 대관류 다수를 의도적으로 제외) 어드민 전체 목록에는 재사용할 수 없다(재사용
// 시 강당/회의실/청년정보 등 다수 항목이 어느 그룹에도 속하지 못해 "누락"이 발생한다).
export type CategoryMinGroup = { major: string; minors: string[] };

const OPEN_SPACES_GROUPS_STATIC: CategoryMinGroup[] = [
  {
    major: '체육시설',
    minors: [
      '테니스장', '골프장', '풋살장', '축구장', '농구장', '족구장', '체육관', '야구장',
      '다목적경기장', '배드민턴장', '탁구장', '배구장', '수영장', '운동장', '피클볼장',
    ],
  },
  {
    major: '문화시설',
    minors: ['공연장', '전시실', '도서관', '문화원', '문화의집', '미술관', '역사박물관', '종합/기타박물관', '과학관', '시민교육센터'],
  },
  {
    major: '자연/공원',
    minors: ['공원', '생태공원', '수목원', '자연휴양림', '캠핑장', '광장', '역사유적지', '관광명소'],
  },
  {
    major: '키즈/놀이시설',
    minors: [
      '어린이놀이터', '어린이놀이시설(야외)', '어린이놀이시설(실내)', '키즈카페', '바닥분수/물놀이시설',
      '체험학습장', '육아종합지원센터', '유아교육진흥원',
    ],
  },
  {
    major: '공공청사 대관',
    minors: ['강당', '강의실', '다목적실', '회의실', '주민공유공간', '청년공간', '교육시설', '녹화장소'],
  },
  { major: '기타', minors: ['기타', '민원 등 기타'] },
];

const EVENTS_GROUPS_STATIC: CategoryMinGroup[] = [
  {
    major: '체육시설',
    minors: [
      '테니스장', '골프장', '풋살장', '축구장', '농구장', '족구장', '체육관', '야구장',
      '다목적경기장', '배드민턴장', '탁구장', '배구장', '운동장', '피클볼장', '스포츠',
    ],
  },
  {
    major: '문화/축제',
    minors: ['공연장', '전시실', '전시/관람', '미술제작', '공예/취미', '역사', '문화행사', '지역축제/페스티벌'],
  },
  {
    major: '자연/체험',
    minors: ['캠핑장', '산림여가', '공원탐방', '농장체험', '도시농업', '자연/과학', '광장'],
  },
  { major: '키즈/육아', minors: ['공공키즈카페', '어린이실내놀이터'] },
  { major: '배움/교육', minors: ['교육체험', '교양/어학', '교육시설', '전문/자격증', '정보통신'] },
  {
    major: '공공청사/행정',
    minors: [
      '강당', '강의실', '다목적실', '회의실', '주민공유공간', '녹화장소', '청년공간', '청년정보',
      '단체봉사', '보건소', '서북병원', '어린이병원', '장애인버스',
    ],
  },
  { major: '기타', minors: ['기타', '민원 등 기타'] },
];

// 실제 살아있는 옵션(get_category_min_options 결과)만 각 그룹에 남기고, 정적 그룹 정의에
// 없는 값(신규 카테고리 추가 등으로 미분류된 값)은 전부 '기타'로 합쳐 절대 누락되지 않게
// 한다 — 이 그룹핑 파일을 갱신하지 않아도 새 카테고리가 조용히 사라지지 않는다.
export function buildCategoryMinGroups(liveOptions: string[], staticGroups: CategoryMinGroup[]): CategoryMinGroup[] {
  const assigned = new Set(staticGroups.flatMap((g) => g.minors));
  const unassigned = liveOptions.filter((opt) => !assigned.has(opt));

  return staticGroups
    .map((g) => ({ ...g, minors: g.minors.filter((m) => liveOptions.includes(m)) }))
    .map((g) => (g.major === '기타' ? { ...g, minors: [...g.minors, ...unassigned] } : g))
    .filter((g) => g.minors.length > 0);
}

export function buildOpenSpacesCategoryMinGroups(liveOptions: string[]): CategoryMinGroup[] {
  return buildCategoryMinGroups(liveOptions, OPEN_SPACES_GROUPS_STATIC);
}

export function buildEventsCategoryMinGroups(liveOptions: string[]): CategoryMinGroup[] {
  return buildCategoryMinGroups(liveOptions, EVENTS_GROUPS_STATIC);
}
