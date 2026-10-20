import { afterEach, describe, expect, it, vi } from 'vitest';

// [블로그 후기 제목 노출](2026-10-20 사용자 지시): spot-blog-reviews/route.test.ts와
// 동일한 검증 구조.
function makeSingleBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  builder.from = () => builder;
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.single = () => Promise.resolve(result);
  return builder;
}

describe('GET /api/events/curated-blog-urls', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/spaces/blog-title');
    vi.resetModules();
  });

  it('큐레이션 URL이 있으면 각 URL의 제목을 함께 내려준다', async () => {
    const builder = makeSingleBuilder({ data: { curated_blog_urls: ['https://blog.naver.com/a/1'] }, error: null });
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => builder }));
    vi.doMock('@/lib/spaces/blog-title', () => ({ fetchBlogTitle: vi.fn().mockResolvedValue('이벤트 다녀온 후기') }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/events/curated-blog-urls?event_id=event-1') as never);
    const data = await res.json();

    expect(data.urls).toEqual([{ url: 'https://blog.naver.com/a/1', title: '이벤트 다녀온 후기' }]);
  });

  it('event_id가 없으면 빈 배열을 내려준다', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/events/curated-blog-urls') as never);
    const data = await res.json();

    expect(data.urls).toEqual([]);
  });

  it('DB 조회가 실패하면 빈 배열로 안전 폴백한다', async () => {
    const builder = makeSingleBuilder({ data: null, error: { message: 'db down' } });
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => builder }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/events/curated-blog-urls?event_id=event-1') as never);
    const data = await res.json();

    expect(data.urls).toEqual([]);
  });
});
