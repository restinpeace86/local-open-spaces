import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { PostDetailModal } from './post-detail-modal';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [맘스픽 프리뷰/상세 카드 분리](2026-09-13 사용자 지시): "찜기능은 상세 카드쪽에서
// 찜 줄 수 있도록" — Decision 019(열심맘 이상만 좋아요 UI 노출)를 그대로 지키는지,
// 날짜/전체 태그/사진이 프리뷰에서 빠진 만큼 여기서 전부 보이는지 검증한다.
const mockUser = { current: null as { id: string } | null };
vi.mock('@/hooks/use-user', () => ({
  useUser: () => ({ user: mockUser.current, isLoading: false }),
}));

const getMyProfileMock = vi.fn();
vi.mock('@/lib/auth/profile', () => ({
  getMyProfile: () => getMyProfileMock(),
}));

const getMyLikedPostIdsMock = vi.fn();
const toggleLikeMock = vi.fn();
vi.mock('@/lib/community/posts', () => ({
  getMyLikedPostIds: (ids: string[]) => getMyLikedPostIdsMock(ids),
  toggleLike: (postId: string, liked: boolean) => toggleLikeMock(postId, liked),
}));

function basePost(overrides: Partial<DashboardPost> = {}): DashboardPost {
  return {
    id: 'post-1',
    post_type: 'survey_review',
    rating: null,
    content: '아이가 정말 좋아했어요',
    checklist_answers: null,
    age_groups: ['영유아'],
    visit_environment: 'outdoor',
    satisfaction_points: ['parking'],
    duration_type: 'half_day',
    weather_tags: ['rainy_day'],
    infra_tags: ['clean_restroom'],
    companion_type: 'friends_group',
    photo_urls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
    like_count: 3,
    is_adopted: false,
    created_at: '2026-09-04T00:00:00Z',
    spotName: '행복어린이공원',
    spotId: 'spot-1',
    author: { id: 'author-1', nickname: '민지맘', grade: 'sprout' },
    ...overrides,
  };
}

describe('PostDetailModal', () => {
  afterEach(() => {
    mockUser.current = null;
    getMyProfileMock.mockReset();
    getMyLikedPostIdsMock.mockReset();
    toggleLikeMock.mockReset();
  });

  it('프리뷰에서 뺀 날짜/전체 태그(날씨·인프라·동반형태 포함)/전체 내용/사진을 전부 보여준다', () => {
    render(<PostDetailModal post={basePost()} onClose={vi.fn()} />);

    expect(screen.getByText(/2026\.09\.04/)).toBeInTheDocument();
    expect(screen.getByText(/영유아/)).toBeInTheDocument();
    expect(screen.getByText(/탁 트인 야외/)).toBeInTheDocument();
    expect(screen.getByText(/비 오는 날/)).toBeInTheDocument(); // weather_tags
    expect(screen.getByText(/화장실/)).toBeInTheDocument(); // infra_tags
    expect(screen.getByText(/친구네 가족/)).toBeInTheDocument(); // companion_type
    expect(screen.getByText('아이가 정말 좋아했어요')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('사진을 탭하면 그 사진부터 전체 화면 뷰어가 열린다', async () => {
    render(<PostDetailModal post={basePost()} onClose={vi.fn()} />);

    const images = screen.getAllByRole('img');
    fireEvent.click(images[1].closest('button')!);

    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
  });

  it('비로그인이면 좋아요 버튼이 보이지 않는다', () => {
    mockUser.current = null;
    render(<PostDetailModal post={basePost()} onClose={vi.fn()} />);

    expect(screen.queryByText(/🤍|❤️/)).not.toBeInTheDocument();
  });

  it('로그인했지만 등급이 열심맘 미만(sprout)이면 좋아요 버튼이 보이지 않는다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'sprout' });
    getMyLikedPostIdsMock.mockResolvedValue(new Set());
    render(<PostDetailModal post={basePost()} onClose={vi.fn()} />);

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled());
    expect(screen.queryByText(/🤍|❤️/)).not.toBeInTheDocument();
  });

  it('열심맘 이상이면 좋아요 버튼이 보이고, 누르면 toggleLike를 호출한다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    getMyLikedPostIdsMock.mockResolvedValue(new Set());
    render(<PostDetailModal post={basePost({ like_count: 3 })} onClose={vi.fn()} />);

    expect(await screen.findByText('🤍 3')).toBeInTheDocument();

    fireEvent.click(screen.getByText('🤍 3'));

    expect(await screen.findByText('❤️ 4')).toBeInTheDocument();
    await waitFor(() => expect(toggleLikeMock).toHaveBeenCalledWith('post-1', false));
  });

  it('닫기(✕)를 누르면 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(<PostDetailModal post={basePost()} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalled();
  });

  // [맘스픽 상세 → 스팟픽 이동](2026-09-13 사용자 지시): "어쨌든 맘스픽으로부터
  // 스팟픽의 해당 장소로 갈수 있어야해.. 상세카드내에 그게 있어야해" — spot_id가
  // 있으면 /nearby?spot=<id>로 가는 링크가 보이고, 없으면(이벤트를 가리키거나
  // 과거 데이터라 둘 다 비어있는 글) 보이지 않는지 검증한다.
  it('spotId가 있으면 "스팟픽에서 이 장소 보기" 링크가 /nearby?spot=<id>로 연결된다', () => {
    render(<PostDetailModal post={basePost({ spotId: 'spot-42' })} onClose={vi.fn()} />);

    const link = screen.getByText('📍 스팟픽에서 이 장소 보기').closest('a');
    expect(link).toHaveAttribute('href', '/nearby?spot=spot-42');
  });

  it('spotId가 없으면 스팟픽 이동 링크가 보이지 않는다', () => {
    render(<PostDetailModal post={basePost({ spotId: null })} onClose={vi.fn()} />);

    expect(screen.queryByText('📍 스팟픽에서 이 장소 보기')).not.toBeInTheDocument();
  });
});
