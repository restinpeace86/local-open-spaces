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
//
// [이벤트픽 대분류 6종으로 축소](2026-09-04 사용자 지시): 기존 7대 대분류 중 "스포츠 대여"
// (테니스장/축구장/체육관 등 15개 중분류)를 제거해 6대 대분류(자연/캠핑·공공 키즈카페·
// 체험/농장·축제/이벤트·문화/전시·배움/클래스)로 축소한다 — 실측으로 확인한 이유: 이
// 화면은 "오늘 진행 중인 가족 대상 이벤트"만 카운트하는데, 스포츠 대여 15개 중분류 중
// 12개(테니스장·축구장·체육관·운동장·수영장 등)는 그 조건에 항상 0건이라 바텀시트를 열어도
// 칩 자체가 하나도 안 보였고, 나머지 3개(스포츠/야구장/풋살장)도 2~4건뿐이었다(개선사항 3의
// categoryCounts 0건 제외 로직이 의도대로 정상 작동한 결과였을 뿐, 그 로직 자체의 버그는
// 아니다). 이 시설들은 open_spaces에 실제로 수백 건씩 존재하지만(테니스장 705건 등),
// getCategoryMinFeed가 캠핑장/체험휴양마을/교육농장/체험학습장(개선사항 4)처럼
// SHARED_OPEN_SPACES_CATEGORY_MINS에 등록돼 있지 않아 연동되지 않는다 — 사용자가 이번에
// 이 대분류 자체를 없애기로 확정해, open_spaces 연동을 추가로 넓히는 대신 목록에서 제거한다.
// 기반 데이터(category_maj='스포츠 대여'로 태깅된 기존 행)는 삭제하지 않는다 — 이 UI
// 목록에서만 선택할 수 없게 될 뿐이다. 챗봇 vibe taxonomy(search-engine.ts VIBE_CATEGORY_MINS)는
// 이미 이 6종만 쓰고 있었으므로(2026-09-03) 이제 두 체계가 완전히 일치한다.
export type CategoryMajOption = {
  maj: string;
  emoji: string;
  color: string;
  minorCategories: string[];
};

export const CATEGORY_MAJ_OPTIONS: CategoryMajOption[] = [
  { maj: '자연 / 캠핑', emoji: '🏕️', color: '#16a34a', minorCategories: ['캠핑장', '산림여가', '공원탐방'] },
  // [이벤트픽 대분류 개편](2026-09-05 사용자 지시): "공공 키즈카페"를 "키즈놀이터"로
  // 개명하고, open_spaces의 "키즈카페"(GG_KIDSCAFE 어댑터 — 서울형/공공 한정이 아닌
  // 민간 포함 더 넓은 데이터셋)를 세 번째 중분류로 추가한다. 체험휴양마을 등(위 "체험/농장"
  // 참고)과 동일한 패턴 — get-home-feed.ts SHARED_OPEN_SPACES_CATEGORY_MINS에도 함께
  // 등록해야 실제로 open_spaces 데이터가 이 대분류에 섞여 나온다. 챗봇의 KIDS_CAFE vibe
  // (search-engine.ts VIBE_CATEGORY_MINS)는 이미 이 open_spaces 값을 포함하고 있었다 —
  // 이번 변경으로 이벤트픽 홈 화면도 그 정의를 따라간다.
  { maj: '키즈놀이터', emoji: '🧸', color: '#f59e0b', minorCategories: ['공공키즈카페', '어린이실내놀이터', '키즈카페'] },
  {
    maj: '체험 / 농장',
    emoji: '🌱',
    color: '#84cc16',
    // [todo.md 개선사항 4](2026-09-03): 체험휴양마을/교육농장/체험학습장은 open_spaces
    // 원본 데이터를 공유해 노출하는 상시 공간이다(get-home-feed.ts getCategoryMinFeed의
    // SHARED_OPEN_SPACES_CATEGORY_MINS 참고) — 별도 이벤트 데이터가 아니라 스팟픽과
    // 동일한 원천을 재사용한다(제5장 제4조 기존 구조 우선).
    minorCategories: ['농장체험', '도시농업', '자연/과학', '체험휴양마을', '교육농장', '체험학습장'],
  },
  { maj: '축제 / 이벤트', emoji: '🎉', color: '#0ea5e9', minorCategories: ['지역축제/페스티벌', '문화행사', '광장'] },
  {
    maj: '문화 / 전시',
    emoji: '🖼️',
    color: '#8b5cf6',
    minorCategories: ['공연장', '전시실', '전시/관람', '미술제작', '공예/취미', '역사'],
  },
  { maj: '배움 / 클래스', emoji: '📚', color: '#f43f5e', minorCategories: ['교육체험', '교양/어학', '교육시설'] },
];

const ALL_MINOR_CATEGORIES = new Set(CATEGORY_MAJ_OPTIONS.flatMap((opt) => opt.minorCategories));

// /api/home/category-feed가 요청받은 category_min 값을 검증할 때 쓴다(isUiCategory와 동일한
// 목적, 대상 값 집합만 다름).
export function isKnownCategoryMin(value: string): boolean {
  return ALL_MINOR_CATEGORIES.has(value);
}
