// [공간 문제 해결 후보 검토 표시](2026-09-27 사용자 지시): "너가 후보라고
// 해놓은거는.. 관리자화면의 open_spaces쪽에 그리드 row쪽에 좀 표시 해줄수
// 있어?.. 표시해놓으면 내가 그거보고 한번 확인해보게" — 채팅으로만 보고했던
// category_min 기준 키워드 후보 분석을 그리드에서 바로 눈에 띄게 표시만 한다.
// 이 표시는 category_min/service_category_id 등 실제 분류 데이터를 바꾸지
// 않는다(제3장 제5조 추측 금지, 제7장 제3조) — 관리자가 직접 확인할 표본을
// 고르는 보조 표시일 뿐이다.

const INCLUDE_KEYWORDS = /어린이|유아|키즈|장난감|과학관|상상|생태|체험|모험|동화/;
const EXCLUDE_KEYWORDS = /어린이집|유치원|지역아동센터|방과후교실|돌봄센터|경로당/;

// [공원 노이즈 확인](2026-09-27 실측): "어린이/유아"만으로는 전국에 흔한
// "OOO어린이공원"(도시공원법상 소규모 놀이터형 공원 명칭)과 "OO공원
// 어린이놀이시설/놀이터"(놀이시설 등록 표기)에 대량으로 걸린다 — 실측으로
// 후보 10,052건 중 상당수가 이 패턴이었고, "어린이/유아"를 빼고 테마성
// 키워드만 남기자 723건으로 줄면서 유아숲체험원/생태공원/모험·상상놀이터 등
// 실제로 특색 있는 공간들만 남았다. 공원만 이 좁은 규칙을 쓴다.
const PARK_THEME_KEYWORDS = /생태|체험|모험|동화|과학관|상상|키즈|장난감/;

// [도서관 노이즈 확인](2026-09-27 실측, 사용자 지시): "아니 통영시립도서관
// 아동자료실_유아자료실은 아니야 순수 어린이 도서관만" — "OO도서관_아동자료실/
// 어린이자료실"처럼 일반도서관 안의 한 구역(자료실)만 이름에 "어린이/아동"이
// 붙는 경우가 있다(실측 4건: 레인보우영동도서관_어린이자료실, 통영시립도서관
// 아동자료실_유아자료실 등) — 건물 전체가 어린이 전용인 "OOO어린이도서관"과는
// 다르다. 도서관만 "자료실"이 포함되면 제외한다(그 외 카테고리는 "자료실"이
// 노이즈 신호인지 확인된 바 없어 건드리지 않음, 제3장 제5조 추측 금지).
const LIBRARY_SECTION_ONLY_KEYWORDS = /자료실/;

// [체육시설 검토 제외](2026-09-27 사용자 지시): "체육시설은 수영장 외에는
// 다 빼도 돼" — 수영장만 남기고 나머지 중분류는 후보 표시 대상에서 제외.
const EXCLUDED_SPORTS_MINORS = new Set([
  '테니스장',
  '골프장',
  '풋살장',
  '축구장',
  '농구장',
  '족구장',
  '체육관',
  '야구장',
  '다목적경기장',
  '배드민턴장',
  '탁구장',
  '배구장',
  '운동장',
  '피클볼장',
]);

// [이미 분류됨/노이즈 대분류 제외](2026-09-27 사용자 지시): "주택단지는 다
// 빼도 돼", "학교도 빼도돼" — 실측으로 주택단지(45,930건 중 20,598건)는
// 아파트 단지 내부 시설명이라 노이즈로 판단됐다. 키즈카페/놀이방식당/
// 놀이방찜질방·스파는 이전 지시("이미 내가 분류해놓은거니깐")로 이미 관리자가
// 직접 분류를 끝낸 대상이라 후보 표시가 필요 없다.
const ALWAYS_EXCLUDED_CATEGORY_MINS = new Set(['주택단지', '학교', '키즈카페', '놀이방식당', '놀이방찜질방/스파']);

export function isKidsSpaceReviewCandidate(name: string, categoryMin: string | null): boolean {
  if (categoryMin && ALWAYS_EXCLUDED_CATEGORY_MINS.has(categoryMin)) return false;
  if (categoryMin && EXCLUDED_SPORTS_MINORS.has(categoryMin)) return false;

  if (categoryMin === '공원') return PARK_THEME_KEYWORDS.test(name);
  if (categoryMin === '도서관' && LIBRARY_SECTION_ONLY_KEYWORDS.test(name)) return false;

  return INCLUDE_KEYWORDS.test(name) && !EXCLUDE_KEYWORDS.test(name);
}
