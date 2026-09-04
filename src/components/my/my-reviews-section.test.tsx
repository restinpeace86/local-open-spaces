import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyReviewsSection } from './my-reviews-section';

const listMyPostsMock = vi.fn();
vi.mock('@/lib/community/posts', () => ({
  listMyPosts: (...args: unknown[]) => listMyPostsMock(...args),
}));

function survivedPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    post_type: 'survey_review',
    rating: null,
    content: '주차장은 넓은데 주말 오전에는 붐벼요',
    checklist_answers: null,
    age_groups: ['영유아'],
    visit_environment: 'outdoor',
    satisfaction_points: ['parking'],
    duration_type: 'half_day',
    weather_tags: [],
    infra_tags: [],
    companion_type: null,
    photo_urls: ['https://example.com/photo.jpg'],
    like_count: 0,
    is_adopted: false,
    created_at: '2026-09-04T00:00:00Z',
    open_spaces: { name: '어린이대공원' },
    events: null,
    ...overrides,
  };
}

// [todo.md 개선사항7 - 마이페이지 C영역](2026-09-04) / Decision 020: 컴팩트 리스트 →
// 클릭 시 전체 설문 결과 + 사진을 보여주는 상세 모달을 검증한다.
describe('MyReviewsSection', () => {
  afterEach(() => {
    listMyPostsMock.mockReset();
  });

  it('불러오는 중에는 안내 문구를 보여준다', () => {
    listMyPostsMock.mockReturnValue(new Promise(() => {})); // 영원히 pending
    render(<MyReviewsSection userId="user-1" />);
    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
  });

  it('후기가 없으면 빈 상태 안내와 "첫 후기 쓰러 가기" 링크를 보여준다', async () => {
    listMyPostsMock.mockResolvedValue([]);
    render(<MyReviewsSection userId="user-1" />);

    expect(await screen.findByText(/아직 작성한 후기가 없어요/)).toBeInTheDocument();
    expect(screen.getByText('첫 후기 쓰러 가기').closest('a')).toHaveAttribute('href', '/mom-pick');
  });

  it('리스트 아이템을 클릭하면 전체 설문 결과와 사진이 담긴 상세 모달이 열린다', async () => {
    listMyPostsMock.mockResolvedValue([survivedPost()]);
    render(<MyReviewsSection userId="user-1" />);

    fireEvent.click(await screen.findByText('어린이대공원'));

    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/몇 세 아이와 좋았나요/)).toBeInTheDocument();
    expect(dialog.getByText('영유아')).toBeInTheDocument();
    expect(dialog.getByText(/방문 환경/)).toBeInTheDocument();
    expect(dialog.getByText('☀️ 탁 트인 야외')).toBeInTheDocument();
    expect(dialog.getByText('주차장은 넓은데 주말 오전에는 붐벼요')).toBeInTheDocument();
    expect(dialog.getByAltText('후기 사진')).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('과거 마이크로 리뷰(post_type=micro_review)도 상세 모달에서 별점/텍스트로 보여준다(하위 호환)', async () => {
    listMyPostsMock.mockResolvedValue([
      survivedPost({
        post_type: 'micro_review',
        rating: 4,
        content: '좋았어요',
        age_groups: null,
        visit_environment: null,
        satisfaction_points: null,
        duration_type: null,
        photo_urls: null,
      }),
    ]);
    render(<MyReviewsSection userId="user-1" />);

    fireEvent.click(await screen.findByText('어린이대공원'));

    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('★★★★☆')).toBeInTheDocument();
    expect(dialog.getByText('좋았어요')).toBeInTheDocument();
  });

  it('조회 실패 시 에러 메시지를 보여준다', async () => {
    listMyPostsMock.mockRejectedValue(new Error('내 활동 조회 실패: network error'));
    render(<MyReviewsSection userId="user-1" />);

    await waitFor(() => expect(screen.getByText('내 활동 조회 실패: network error')).toBeInTheDocument());
  });
});
