// [대분류/중분류 드릴다운 개편](2026-08-27 사용자 지시): 이벤트픽 홈 화면의 카테고리 Quick
// 그리드를 기존 event_type 기반 5대 UI 카테고리(체험·클래스/야외·자연/전시·박물관/공연·축제/
// 키즈·액티비티)에서, 실제 데이터 정제 파이프라인으로 완성한 7대 대분류(category_maj)/
// 중분류(category_min) 체계로 교체한다.
//
// 이 목록은 scripts/ingest/lib/category-maj-taxonomy.mjs의 CATEGORY_MAJ_OF와 반드시 동일하게
// 유지해야 한다 — 그 파일은 수집 파이프라인 전용 모듈(.mjs, scripts/)이라 Next.js 프론트엔드
// (src/)에서 직접 import할 수 없어 부득이하게 값을 복제했다. 이 taxonomy는 이미 여러 차례
// 실제 반영을 거쳐 안정화된 완성 목록이라 변경 빈도가 낮다.
//
// get-home-feed.ts의 EXCLUDED_CATEGORY_MIN(나들이/여가와 무관한 시설 대관·행정 시설류 16종)에
// 해당하는 중분류는 이 목록에서 제외했다 — 선택해도 항상 0건만 나오는 죽은 옵션을 만들지
// 않기 위함이다(실제 겹치는 항목은 "골프장" 1건뿐, 나머지 15종은 애초에 이 taxonomy에 없다).
export type CategoryMajOption = {
  maj: string;
  emoji: string;
  color: string;
  minorCategories: string[];
};

export const CATEGORY_MAJ_OPTIONS: CategoryMajOption[] = [
  { maj: '자연 / 캠핑', emoji: '🏕️', color: '#16a34a', minorCategories: ['캠핑장', '산림여가', '공원탐방'] },
  { maj: '공공 키즈카페', emoji: '🧸', color: '#f59e0b', minorCategories: ['공공키즈카페', '어린이실내놀이터'] },
  { maj: '체험 / 농장', emoji: '🌱', color: '#84cc16', minorCategories: ['농장체험', '도시농업', '자연/과학'] },
  { maj: '축제 / 이벤트', emoji: '🎉', color: '#0ea5e9', minorCategories: ['지역축제/페스티벌', '문화행사', '광장'] },
  {
    maj: '문화 / 전시',
    emoji: '🖼️',
    color: '#8b5cf6',
    minorCategories: ['공연장', '전시실', '전시/관람', '미술제작', '공예/취미', '역사'],
  },
  { maj: '배움 / 클래스', emoji: '📚', color: '#f43f5e', minorCategories: ['교육체험', '교양/어학', '교육시설'] },
  {
    maj: '스포츠 대여',
    emoji: '🏀',
    color: '#ea580c',
    minorCategories: [
      '테니스장', '풋살장', '축구장', '체육관', '농구장', '족구장', '야구장',
      '다목적경기장', '배드민턴장', '탁구장', '배구장', '수영장', '운동장', '피클볼장', '스포츠',
    ],
  },
];

const ALL_MINOR_CATEGORIES = new Set(CATEGORY_MAJ_OPTIONS.flatMap((opt) => opt.minorCategories));

// /api/home/category-feed가 요청받은 category_min 값을 검증할 때 쓴다(isUiCategory와 동일한
// 목적, 대상 값 집합만 다름).
export function isKnownCategoryMin(value: string): boolean {
  return ALL_MINOR_CATEGORIES.has(value);
}
