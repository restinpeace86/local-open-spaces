import { describe, expect, it, vi, beforeEach } from 'vitest';

// [Decision — 2026-09-15 사용자 지시] "내가 쓴글 빈약한데 파워만돼서 파워맘
// 추천픽에 노출됐잖아" — getExpertPosts()는 등급(grade)만이 아니라 관리자가
// 채택(is_adopted=true)한 글만 추천픽에 노출해야 한다는 것을 검증한다.
function makeSupabaseMock({
  expertProfileIds,
  posts,
  authorProfiles,
}: {
  expertProfileIds: string[];
  posts: Array<Record<string, unknown>>;
  authorProfiles: Array<{ id: string; nickname: string | null; grade: string }>;
}) {
  const postsEqMock = vi.fn(() => postsBuilder);
  const postsInMock = vi.fn(() => postsBuilder);

  const postsBuilder: Record<string, unknown> = {};
  postsBuilder.select = () => postsBuilder;
  postsBuilder.in = postsInMock;
  postsBuilder.eq = postsEqMock;
  postsBuilder.order = () => postsBuilder;
  postsBuilder.range = () => Promise.resolve({ data: posts, error: null, count: posts.length });

  const profilesBuilder: Record<string, unknown> = {};
  profilesBuilder.select = () => profilesBuilder;
  // 첫 호출(getExpertPosts): .in('grade', [...]) → 상급 등급 프로필 id만.
  // 두 번째 호출(attachAuthors 내부): .in('id', [...]) → nickname/grade 조회.
  profilesBuilder.in = vi.fn((field: string) => {
    if (field === 'grade') {
      return Promise.resolve({ data: expertProfileIds.map((id) => ({ id })), error: null });
    }
    return Promise.resolve({ data: authorProfiles, error: null });
  });

  const admin = {
    from: (table: string) => (table === 'mom_pick_posts' ? postsBuilder : profilesBuilder),
  };

  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));

  return { postsEqMock, postsInMock };
}

function postRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    author_id: 'author-1',
    post_type: 'survey_review',
    rating: null,
    content: '좋았어요',
    checklist_answers: null,
    age_groups: null,
    visit_environment: null,
    satisfaction_points: null,
    duration_type: null,
    weather_tags: null,
    infra_tags: null,
    companion_type: null,
    photo_urls: null,
    like_count: 0,
    is_adopted: true,
    created_at: '2026-09-15T00:00:00.000Z',
    spot_id: 'spot-1',
    open_spaces: { name: '행복어린이공원' },
    events: null,
    ...overrides,
  };
}

describe('getExpertPosts', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('파워맘/우수맘 글 조회 시 is_adopted=true 조건을 걸어 관리자가 채택한 글만 가져온다', async () => {
    const { postsEqMock, postsInMock } = makeSupabaseMock({
      expertProfileIds: ['author-1'],
      posts: [postRow()],
      authorProfiles: [{ id: 'author-1', nickname: '하린맘', grade: 'power' }],
    });

    const { getExpertPosts } = await import('./mom-pick-dashboard');
    const result = await getExpertPosts(10);

    expect(postsInMock).toHaveBeenCalledWith('author_id', ['author-1']);
    expect(postsEqMock).toHaveBeenCalledWith('is_adopted', true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].author.grade).toBe('power');
  });

  it('작성자가 파워맘/우수맘이 없으면 채택 조회 자체를 하지 않고 빈 결과를 반환한다', async () => {
    const { postsInMock } = makeSupabaseMock({
      expertProfileIds: [],
      posts: [],
      authorProfiles: [],
    });

    const { getExpertPosts } = await import('./mom-pick-dashboard');
    const result = await getExpertPosts(10);

    expect(result).toEqual({ items: [], total: 0 });
    expect(postsInMock).not.toHaveBeenCalled();
  });
});
