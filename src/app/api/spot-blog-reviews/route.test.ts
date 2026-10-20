import { afterEach, describe, expect, it, vi } from 'vitest';

// [블로그 후기 제목 노출](2026-10-20 사용자 지시): curation에 저장된 URL별로
// fetchBlogTitle을 호출해 title을 함께 내려주는지 검증한다.
function makeMaybeSingleBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  builder.from = () => builder;
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = () => Promise.resolve(result);
  return builder;
}

describe('GET /api/spot-blog-reviews', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.doUnmock('@/lib/spaces/blog-title');
    vi.resetModules();
  });

  it('큐레이션 URL이 있으면 각 URL의 제목을 함께 내려준다', async () => {
    const builder = makeMaybeSingleBuilder({
      data: { blog_url_1: 'https://blog.naver.com/a/1', blog_url_2: null, blog_url_3: null },
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => builder }));
    vi.doMock('@/lib/spaces/blog-title', () => ({
      fetchBlogTitle: vi.fn().mockResolvedValue('실제 다녀온 후기'),
    }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/spot-blog-reviews?spot_id=spot-1') as never);
    const data = await res.json();

    expect(data.item.urls).toEqual([{ url: 'https://blog.naver.com/a/1', title: '실제 다녀온 후기' }]);
    expect(data.item.source).toBe('curation');
  });

  it('제목 fetch가 실패해도(null) 전체 응답은 그대로 내려간다', async () => {
    const builder = makeMaybeSingleBuilder({
      data: { blog_url_1: 'https://blog.naver.com/a/1', blog_url_2: null, blog_url_3: null },
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => builder }));
    vi.doMock('@/lib/spaces/blog-title', () => ({ fetchBlogTitle: vi.fn().mockResolvedValue(null) }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/spot-blog-reviews?spot_id=spot-1') as never);
    const data = await res.json();

    expect(data.item.urls).toEqual([{ url: 'https://blog.naver.com/a/1', title: null }]);
  });

  it('큐레이션 URL이 없으면 빈 배열을 내려주고 title fetch를 시도하지 않는다', async () => {
    const builder = makeMaybeSingleBuilder({
      data: { blog_url_1: null, blog_url_2: null, blog_url_3: null },
      error: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => builder }));
    const fetchBlogTitleMock = vi.fn();
    vi.doMock('@/lib/spaces/blog-title', () => ({ fetchBlogTitle: fetchBlogTitleMock }));

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/spot-blog-reviews?spot_id=spot-1') as never);
    const data = await res.json();

    expect(data.item).toEqual({ urls: [], source: 'none' });
    expect(fetchBlogTitleMock).not.toHaveBeenCalled();
  });
});
