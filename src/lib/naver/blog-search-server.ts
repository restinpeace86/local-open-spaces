import { cleanNaverText, resolveBlogSort } from '@/lib/admin/naver-blog-search';

// [네이버 블로그 검색 — 서버 전용 호출부](2026-09-10) — 기존 관리자
// blog-search/route.ts가 인라인으로 갖고 있던 NAVER API HUB 호출을, 소비자
// 블로그 후기 캐싱(todo.md 개선사항2-7)에서도 재사용하기 위해 공용 헬퍼로 뺐다.
// NAVER_CLIENT_ID/SECRET을 다루므로 API 라우트(서버)에서만 import한다.
//
// [NAVER API HUB 이관](admin/spot-curations/blog-search/route.ts 주석 참고):
// 2026-06-25부터 엔드포인트/인증 헤더가 바뀌었다.
const NAVER_BLOG_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/blog';

export type NaverBlogRawItem = {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  postdate: string; // "YYYYMMDD"
};

export type NaverBlogFetchResult =
  | { ok: true; items: NaverBlogRawItem[] }
  | { ok: false; error: string; status: number };

export async function fetchNaverBlogItems(
  query: string,
  { sort, display = 5 }: { sort?: string | null; display?: number } = {}
): Promise<NaverBlogFetchResult> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정', status: 500 };
  }

  const url = `${NAVER_BLOG_SEARCH_URL}?${new URLSearchParams({
    query,
    display: String(display),
    sort: resolveBlogSort(sort ?? null),
  }).toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '네이버 요청 실패', status: 502 };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `네이버 블로그 검색 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`, status: 502 };
  }

  const json = (await res.json().catch(() => ({}))) as { items?: NaverBlogRawItem[] };
  const items = (json.items ?? []).map((item) => ({
    ...item,
    title: cleanNaverText(item.title ?? ''),
    description: cleanNaverText(item.description ?? ''),
    bloggername: cleanNaverText(item.bloggername ?? ''),
  }));
  return { ok: true, items };
}
