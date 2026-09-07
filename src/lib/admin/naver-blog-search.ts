// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) — 네이버
// 블로그 검색 API 응답 가공 순수 함수들. route.ts(서버 전용, API 키를 다룸)에서
// 분리해 이 파일만 단위 테스트한다(이 프로젝트는 API 라우트 자체를 직접 테스트하는
// 관례가 없다 — 로직은 순수 함수로 빼서 테스트하고, 라우트는 그 함수를 그대로 쓴다).
export const RECENT_WINDOW_DAYS = 365;

// [정렬 기준을 화면에서 전환](2026-09-06 사용자 지시): "화면에서 sim/date 기준
// 변경해서도 호출할 수 있게.. default는 date로." 클라이언트가 넘긴 sort 값이
// 정해진 두 값(sim/date) 중 하나가 아니면(오타/누락/알 수 없는 값) 추측하지
// 않고 안전한 기본값(date)으로 되돌린다.
export const ALLOWED_BLOG_SORTS = ['sim', 'date'] as const;
export type BlogSortOption = (typeof ALLOWED_BLOG_SORTS)[number];
export const DEFAULT_BLOG_SORT: BlogSortOption = 'date';

export function resolveBlogSort(requested: string | null): BlogSortOption {
  return (ALLOWED_BLOG_SORTS as readonly string[]).includes(requested ?? '')
    ? (requested as BlogSortOption)
    : DEFAULT_BLOG_SORT;
}

// 네이버 검색 API는 매칭 키워드에 자체 <b>/</b> 태그를 씌우고 HTML 엔티티로
// 이스케이프해 돌려준다 — 이 프로젝트가 직접 하이라이팅을 다시 입히므로 네이버 쪽
// <b> 태그는 제거하고, 일반 텍스트로 되돌린다.
export function cleanNaverText(value: string): string {
  return value
    .replace(/<\/?b>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

// "YYYYMMDD" 형식만 유효하게 파싱한다(그 외 형식은 추측하지 않고 null).
export function parsePostdate(postdate: string): Date | null {
  if (!/^\d{8}$/.test(postdate)) return null;
  const year = Number(postdate.slice(0, 4));
  const month = Number(postdate.slice(4, 6));
  const day = Number(postdate.slice(6, 8));
  return new Date(year, month - 1, day);
}

// [최신성 검증(1년 룰)](사용자 지시 원문): "최근 1년 이내 작성된 글이 하나라도
// 있는지 체크함." now를 인자로 받아(고정 가능) 테스트에서 "현재 시각"에 좌우되지
// 않고 결정적으로 검증할 수 있게 한다.
export function isWithinRecentWindow(postdate: string, now: Date = new Date(), windowDays: number = RECENT_WINDOW_DAYS): boolean {
  const parsed = parsePostdate(postdate);
  if (!parsed) return false;
  const ageDays = (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays <= windowDays;
}

// [스마트 검색 쿼리 조합](2026-09-07, implementation/todo.md 개선사항3 1번 — 사용자
// 지시로 세부 방식을 직접 확정): "현재 상호명가지고 검색하고 있는데.. rgnCdNm/
// ronaAddr/lotnoAddr 등 이미 주소데이터 있지않아? 서울시 노원구라고 하면 상호명 +
// 노원 이런식으로" — open_spaces.sigungu_name(예: "서울시 노원구", "경기도 성남시")의
// 마지막 토큰에서 시/군/구 접미사를 뗀 핵심 지역명만 상호명 뒤에 붙인다("노원구"가
// 아니라 "노원"으로 검색해야 성공률이 높다는 사용자 실측 — 원본 todo.md의 "명월점이
// 아닌 명월로 검색" 사례와 동일한 원리).
// 2글자 이상이면서 시/군/구로 끝나야만 접미사로 보고 뗀다 — "여주시"→"여주"는
// 맞지만, 혹시 지역명 자체가 "시"/"군"/"구" 한 글자뿐인 예외적인 경우까지
// 잘못 잘라 빈 문자열을 만들지 않기 위한 최소한의 방어.
function stripSigunguSuffix(token: string): string {
  return token.length > 1 && /[시군구]$/.test(token) ? token.slice(0, -1) : token;
}

export function extractSigunguCoreName(sigunguName: string | null | undefined): string {
  if (!sigunguName) return '';
  const tokens = sigunguName.trim().split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1] ?? '';
  return stripSigunguSuffix(last);
}

// [지역명 하이라이팅 범위 확장](2026-09-07 사용자 지시): "인천광역시 남동구 용천로..
// 시군구 이름은 인천시 남동구.. 인천하고 남동이 블로그 제목이나 본문에
// 포함되어있는지 확인해서.. 노란색 마커표시.. 지금까진 본문에서 남동만 찾아서
// 색 표시 했는데.. 이제는.. 남동뿐만아니라 인천도 색 표시해줘" — sigungu_name의
// 토큰 전부(시/도 + 시/군/구, 예: "인천시"+"남동구")에서 각각 접미사를 뗀 핵심
// 지역명을 전부 반환한다(검색 쿼리 조합에 쓰는 extractSigunguCoreName은 마지막
// 토큰 하나만 쓰던 기존 동작 그대로 유지 — 이 함수는 하이라이팅 전용).
export function extractAllSigunguCoreNames(sigunguName: string | null | undefined): string[] {
  if (!sigunguName) return [];
  const tokens = sigunguName.trim().split(/\s+/).filter(Boolean);
  return tokens.map(stripSigunguSuffix).filter(Boolean);
}

// [지역명 중복 방지 → 재수정](2026-09-07 사용자 지시): 1차 수정은 "상호명이
// [추출한 지역명]+점으로 끝날 때만" 점을 뗐는데, 사용자가 "이유있는감자탕
// 상인월성점처럼.. 상호명에 +점으로 끝나면 지역명 붙이지 말고.. 그대로 상인월성으로
// 점만 빼고.. 지역명은 추가하지말고.. 이유있는감자탕과 같이 +점으로 안끝나면
// 이유있는감자탕 달서 같이 붙여줘"라고 규칙을 다시 확정했다. "상인월성"은 시군구
// 핵심 지역명("달서")과 무관한 지점명(동 이름 등)이라, "[추출한 지역명]+점"으로
// 끝나는지 매칭할 필요 없이 **"점"으로 끝나는지만 보면 된다** — 점으로 끝나면
// 지역명을 아예 붙이지 않고 "점"만 떼고, 점으로 끝나지 않으면 그때만 지역명을
// 붙인다.
export function buildSmartBlogQuery(name: string, sigunguName: string | null | undefined): string {
  const trimmed = name.trim();
  if (trimmed.endsWith('점')) return trimmed.slice(0, -1);
  const core = extractSigunguCoreName(sigunguName);
  return core ? `${trimmed} ${core}` : trimmed;
}

// [지역명 접미사 제거가 오히려 검색을 실패시키는 사례 발견](2026-09-07 사용자 지시):
// "모심갈비가 지역명이 인천광역시 남동구인데 모심갈비에 남동을 붙여서 모심갈비
// 남동으로 찾으면 안나와.. 모심갈비 남동구는 나오고" — "노원구"→"노원"처럼
// 접미사를 떼야 성공률이 높은 지역명이 있는 반면, "남동구"→"남동"처럼 떼면
// 오히려 실패하고 원래 접미사를 붙여야 성공하는 지역명도 있다는 것을 실측으로
// 확인했다. 지역명마다 어느 쪽이 맞는지 미리 알 방법이 없으므로(사전 없이는
// 추측 불가 — 제3장 제5조), 1차 쿼리(접미사 제거)가 결과 없음(hasNoResults)일
// 때만 접미사를 그대로 둔 원본 토큰으로 한 번 더 재검색하는 폴백 쿼리를 만든다
// (실제 재검색 실행/1회 제한은 useSpotCurationForm이 담당 — 이 함수는 순수하게
// "폴백 쿼리 문자열이 무엇인지"만 계산한다). "점"으로 끝나는 상호명은 애초에
// 지역명을 안 쓰므로 폴백 대상이 아니다.
export function buildFallbackBlogQuery(name: string, sigunguName: string | null | undefined): string | null {
  const trimmed = name.trim();
  if (trimmed.endsWith('점')) return null;
  if (!sigunguName) return null;
  const tokens = sigunguName.trim().split(/\s+/).filter(Boolean);
  const rawLast = tokens[tokens.length - 1] ?? '';
  const strippedCore = extractSigunguCoreName(sigunguName);
  // 접미사가 애초에 없었거나(예: 이미 "노원"처럼 저장된 경우) 1차 쿼리와 결과가
  // 같으면 폴백을 만들 이유가 없다.
  if (!rawLast || rawLast === strippedCore) return null;
  return `${trimmed} ${rawLast}`;
}
