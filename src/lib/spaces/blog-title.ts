// [블로그 후기 제목 노출](2026-10-20 todo.md 개선사항2 사용자 지시): "블로그 우리
// 가져오는것도 블로그 1 블로그 2 블로그 3 이렇게 되어있는데.. 이것도 제목 같은거
// 몇자.. 나오게 ? 까지.. 나오도록 하자" — 지금까지는 URL만 저장/노출하고 버튼
// 라벨은 그냥 "블로그 후기 N"이었다. 저장된 URL을 그대로 fetch해 <title>(또는
// og:title)만 뽑아 짧게 보여준다.
//
// [캐시 설계] 매 상세 화면 오픈마다 외부 블로그로 실시간 fetch를 날리면 느리고
// (네트워크 왕복) 상대 서버에도 부담이다 — 서버 프로세스(Vercel 함수 인스턴스)가
// 살아있는 동안은 모듈 스코프 Map에 캐싱해 같은 URL을 반복 요청하지 않는다(
// nearby-restaurants-cache.ts와 동일한 기존 패턴, 제5장 제4조). 실패도 짧게
// 캐싱해(실패 TTL < 성공 TTL) 죽은 블로그 URL에 매 요청마다 재시도하지 않는다.
const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const FAILURE_TTL_MS = 10 * 60 * 1000; // 10분
const FETCH_TIMEOUT_MS = 3000;
export const MAX_TITLE_LENGTH = 24;

type CacheEntry = { title: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

// 네이버 블로그 <title>은 보통 "글제목 : 닉네임 - 네이버 블로그" 형태라 뒤쪽
// 플랫폼 꼬리말을 떼어낸다. 다른 플랫폼(티스토리 등)은 꼬리말 패턴을 추측하지
// 않고 원문 그대로 둔다(제3장 제5조 추측 금지).
const NAVER_BLOG_TITLE_SUFFIX = /\s*:\s*[^:]*-\s*네이버\s*블로그\s*$/;

export function extractTitleFromHtml(html: string): string | null {
  const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const raw = ogMatch?.[1] ?? titleMatch?.[1];
  if (!raw) return null;

  const decoded = raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  const cleaned = decoded.replace(NAVER_BLOG_TITLE_SUFFIX, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function truncateTitle(title: string, maxLength = MAX_TITLE_LENGTH): string {
  return title.length > maxLength ? `${title.slice(0, maxLength)}...` : title;
}

async function fetchTitleUncached(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const html = await res.text();
    return extractTitleFromHtml(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBlogTitle(url: string): Promise<string | null> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.title;

  const title = await fetchTitleUncached(url);
  cache.set(url, { title, expiresAt: Date.now() + (title ? SUCCESS_TTL_MS : FAILURE_TTL_MS) });
  return title;
}

// 테스트 전용 — 모듈 스코프 캐시가 테스트 간에 새어나가지 않도록 초기화한다.
export function clearBlogTitleCache(): void {
  cache.clear();
}
