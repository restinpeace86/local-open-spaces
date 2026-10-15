// [스팟픽 상세 카드 네이버 블로그 후기 캐싱(TTL) — 순수 로직](2026-09-10 사용자
// 지시, implementation/todo.md 개선사항2-7). API 키를 다루는 라우트(route.ts)에서
// 분리해 이 파일만 단위 테스트한다(admin/naver-blog-search.ts와 동일한 관례).

export const BLOG_REVIEW_TTL_DAYS = 10;
export const BLOG_REVIEW_MAX = 3;

// [조회 및 갱신 로직 (Cache-Aside)](스펙): "마지막 갱신일(blog_updated_at)로부터
// 10일이 경과한 경우" 재조회. NULL(한 번도 조회 안 함)이면 fresh가 아니다.
export function isBlogCacheFresh(
  updatedAt: string | Date | null | undefined,
  now: Date = new Date(),
  ttlDays: number = BLOG_REVIEW_TTL_DAYS
): boolean {
  if (!updatedAt) return false;
  const updated = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return false;
  const ageDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays <= ttlDays;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export type NaverBlogSearchItem = {
  title: string;
  link: string;
  description: string;
};

// [실사용 버그 수정](2026-10-16 사용자 지적, 실측: 키즈카페 "위키(WIKI)" 사례):
// "스팟픽에 블로그 후기가.. 다 관련없는 블로그 후기 같아.. 내가 블로그 후기
// 등록한적도 없는데 왜 나오는거지" — 조사 결과 이 함수가 "지역명이 있으면
// 상호명은 전혀 확인하지 않고 지역명만으로 신뢰 판정"하고 있었다. "위키(WIKI)"
// (경기도 성남시 분당구)로 검색한 결과 중 "나무위키"/"위키인포" 같은 완전히
// 무관한 블로그가, 본문 어딘가에 "분당"/"성남"이 우연히 들어있다는 이유만으로
// 그대로 통과해 캐시에 저장됐다(실측: blog.naver.com/wiki-info/... 제목이
// "위키인포 : 네이버 블로그"). 지역명 하나만으로 신뢰를 주는 것 자체가 오판단이다
// — 이 경로는 관리자 검수가 전혀 없는 완전 자동 캐싱(spot-blog-reviews/route.ts)
// 이라, 사람이 한 번 더 보는 블로그 큐레이션 화면의 "워닝 표시"(hasRegionMismatch,
// use-spot-curation-form.ts)보다 훨씬 엄격해야 한다 — 그쪽은 틀려도 관리자가
// 바로 보고 거르지만, 여긴 틀리면 사용자에게 그대로 노출된다.
//
// 수정: 상호명 일치를 항상 필수로 요구한다(지역 정보가 있어도 생략하지 않음).
// 다만 "위키"처럼 짧은 이름은 "나무위키"/"위키인포"처럼 더 긴 단어 안에 그냥
// 끼어있어도(normalize가 공백을 전부 지우므로) 단순 포함 검사로는 걸러지지
// 않는다 — containsAsWholeWord로 그 상호명이 더 긴 한글/영문 단어의 일부가
// 아니라 독립된 단어/구로 등장하는지까지 확인한다(공백을 지우기 전 원문
// 기준으로 앞뒤 글자가 한글/영문/숫자가 아닌지 검사).
function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[a-z0-9가-힣]/i.test(ch);
}

// haystack(공백 보존, 소문자화)에서 token이 더 긴 단어에 묻혀있지 않고 독립된
// 단어/구로 등장하는 위치가 하나라도 있는지 본다 — "나무위키"의 "위키"는 앞
// 글자 "무"가 단어문자라 reject, "위키 카페"의 "위키"는 앞뒤가 공백/문자열
// 끝이라 accept.
function containsAsWholeWord(haystack: string, token: string): boolean {
  if (token.length < 2) return false;
  let idx = haystack.indexOf(token);
  while (idx !== -1) {
    const before = haystack[idx - 1];
    const after = haystack[idx + token.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = haystack.indexOf(token, idx + 1);
  }
  return false;
}

// "위키(WIKI)"처럼 상호명에 영문 병기가 괄호로 붙어있으면 실제 블로그 본문에
// 그 괄호 표기까지 그대로 적히는 경우는 드물다 — 괄호 안 내용을 떼고 핵심
// 상호명만으로 비교한다.
function stripParenthetical(value: string): string {
  return value.replace(/\([^)]*\)/g, '').trim();
}

// [실측으로 발견한 과잉 교정 — 짧은 이름만 단어 경계 검사](2026-10-16, 실제
// 캐시 32건 전체 재검증 중 발견): "용인어린이상상의숲"(공백 없이 저장된 상호명)을
// 블로그 글이 "용인어린이상상의 숲"(사람이 읽기 편하게 중간에 띄어쓴 표기)으로
// 적은, 명백히 맞는 리뷰까지 containsAsWholeWord가 원문 공백을 그대로 보존해
// 비교하는 바람에 떨어뜨렸다. "위키"처럼 짧은(2~3자) 이름만 더 긴 무관한
// 단어에 묻힐 위험이 실제로 있고(나무위키/위키인포), 충분히 길고 구체적인
// 이름("용인어린이상상의숲" 9자)이 우연히 더 긴 무관한 단어 안에 통째로 묻힐
// 확률은 사실상 없어, 그 경우는 공백을 전부 지우고 포함 여부만 봐도 된다.
const SHORT_NAME_LENGTH = 4;

// [신뢰도 검증](스펙): "무조건 가져온 url을 저장하는게 아니고.. 신뢰도 검증은
// 해당 조건으로 검색 + 주소가 제목이나 내용등에 포함되어있을 경우" — 상호명
// 일치는 항상 필수(위 버그 수정)이고, 지역 정보를 알면 지역명도 추가로
// 일치해야 한다(동명이지만 다른 지역에 있는 경우를 걸러냄). 상호명 자체가
// 너무 짧으면(1글자 등) 판정 근거가 안 되므로 그 경우는 무조건 신뢰하지
// 않는다(추측 금지, 제3장 제5조).
export function isTrustedBlogItem(
  item: NaverBlogSearchItem,
  regionCoreNames: string[],
  spotName: string
): boolean {
  const rawHaystack = `${item.title} ${item.description}`.toLowerCase();
  if (!rawHaystack.trim()) return false;

  const coreName = stripParenthetical(spotName).toLowerCase();
  if (coreName.length < 2) return false;

  const nameMatches =
    coreName.length < SHORT_NAME_LENGTH
      ? containsAsWholeWord(rawHaystack, coreName)
      : normalize(rawHaystack).includes(normalize(coreName));
  if (!nameMatches) return false;

  const regions = regionCoreNames.map(normalize).filter((r) => r.length >= 2);
  if (regions.length === 0) return true;
  const compactHaystack = normalize(rawHaystack);
  return regions.some((r) => compactHaystack.includes(r));
}

// 신뢰도 검증을 통과한 URL만 최대 3개(중복 제거) 골라 반환한다.
export function selectTrustedBlogUrls(
  items: NaverBlogSearchItem[],
  regionCoreNames: string[],
  spotName: string,
  max: number = BLOG_REVIEW_MAX
): string[] {
  const urls: string[] = [];
  for (const item of items) {
    if (!item.link) continue;
    if (urls.includes(item.link)) continue;
    if (!isTrustedBlogItem(item, regionCoreNames, spotName)) continue;
    urls.push(item.link);
    if (urls.length >= max) break;
  }
  return urls;
}
