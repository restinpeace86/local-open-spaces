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

// [신뢰도 검증](스펙): "무조건 가져온 url을 저장하는게 아니고 관리자 화면에서
// 사용하는 블로그 큐레이션과 동일하게 ... 신뢰성 있는 블로그 url만 저장합니다.
// 신뢰도 검증은 해당 조건으로 검색 + 주소가 제목이나 내용등에 포함되어있을 경우".
// 관리자 큐레이션의 워닝 판정(hasRegionMismatch)과 동일하게, 스팟의 시군구 핵심
// 지역명이 제목/본문(description)에 하나라도 등장하면 신뢰 대상으로 본다. 지역명을
// 아예 알 수 없으면(sigungu_name 없음) 상호명 자체가 제목/본문에 등장하는지로
// 대신 판정한다(근거 없는 통과를 막는다 — 제3장 제5조).
export function isTrustedBlogItem(
  item: NaverBlogSearchItem,
  regionCoreNames: string[],
  spotName: string
): boolean {
  const haystack = normalize(`${item.title} ${item.description}`);
  if (!haystack) return false;
  const regions = regionCoreNames.map(normalize).filter((r) => r.length >= 2);
  if (regions.length > 0) {
    return regions.some((r) => haystack.includes(r));
  }
  const name = normalize(spotName);
  return name.length >= 2 && haystack.includes(name);
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
