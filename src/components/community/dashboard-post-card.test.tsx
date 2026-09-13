import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPostCard } from './dashboard-post-card';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [맘스픽 프리뷰/상세 카드 분리](2026-09-13 사용자 지시): PostDetailModal이
// useUser()(→ supabase client)를 쓰므로, 실제 로그인 상태를 조회하지 않도록
// 비로그인(guest)으로 고정한다 — detail-modal.test.tsx 등 기존 테스트와 동일한
// 관례.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

function basePost(overrides: Partial<DashboardPost> = {}): DashboardPost {
  return {
    id: 'post-1',
    post_type: 'survey_review',
    rating: null,
    content: null,
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
    is_adopted: false,
    created_at: '2026-09-04T00:00:00Z',
    spotName: '행복어린이공원',
    author: { id: 'user-1', nickname: '민지맘', grade: 'sprout' },
    ...overrides,
  };
}

// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1: survey_review
// 타입 카드 렌더링 — 설문 요약 뱃지 + 자유글을 보여주는지 검증한다. 기존
// micro_review/checklist 렌더링은 회귀 없이 그대로 유지돼야 한다(과거 데이터
// 하위 호환).
// [맘스픽 프리뷰/상세 카드 분리](2026-09-13 사용자 지시): "좀더 줄였으면 좋겠어..
// 내용글도 1줄만.. tag 정도만.. 사진 보기도 없애.. 프리뷰 카드 누르면 상세카드가
// 보이게.. 찜도 없애.. 일자도.. 굳이 프리뷰에서 볼일은 없지 않나?" — 프리뷰
// 카드에서 날짜/좋아요/사진 버튼을 전부 없애고, 카드 전체가 클릭 가능해 누르면
// 상세 모달(PostDetailModal)이 뜨는지 검증한다.
describe('DashboardPostCard', () => {
  it('제목(스팟명) 줄 오른쪽에 작성자 닉네임과 등급이 함께 표시된다', () => {
    render(<DashboardPostCard post={basePost({ author: { id: 'user-1', nickname: '하린맘', grade: 'sprout' } })} />);

    expect(screen.getByText('행복어린이공원')).toBeInTheDocument();
    expect(screen.getByText('하린맘')).toBeInTheDocument();
    expect(screen.getByText('🌱 새싹맘')).toBeInTheDocument();
  });

  it('survey_review는 설문 뱃지(최대 3개)와 자유글 1줄만 보여주고, 날짜/좋아요/사진 버튼은 없다', () => {
    render(
      <DashboardPostCard
        post={basePost({
          age_groups: ['영유아', '미취학'],
          visit_environment: 'outdoor',
          duration_type: 'half_day',
          satisfaction_points: ['parking'],
          content: '아이가 정말 좋아했어요',
          photo_urls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
          like_count: 5,
        })}
      />
    );

    // 5개 뱃지 후보(영유아/미취학/☀️ 탁 트인 야외/⏱️ 반나절 코스/주차 편리) 중
    // 최대 3개만 보이고 나머지는 "+N개"로 요약된다.
    expect(screen.getByText('영유아')).toBeInTheDocument();
    expect(screen.getByText('미취학')).toBeInTheDocument();
    expect(screen.getByText('☀️ 탁 트인 야외')).toBeInTheDocument();
    expect(screen.queryByText('⏱️ 반나절 코스 (3~4시간)')).not.toBeInTheDocument();
    expect(screen.queryByText('주차 편리 🚗')).not.toBeInTheDocument();
    expect(screen.getByText('+2개')).toBeInTheDocument();

    expect(screen.getByText('아이가 정말 좋아했어요')).toBeInTheDocument();

    // 날짜/좋아요/사진 버튼은 프리뷰 카드에서 전부 빠졌다(상세로 이동).
    expect(screen.queryByText(/2026\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/❤️/)).not.toBeInTheDocument();
    expect(screen.queryByText(/사진.*보기/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('카드를 누르면 상세 모달(PostDetailModal)이 열려 날짜/사진/전체 태그를 보여준다', async () => {
    render(
      <DashboardPostCard
        post={basePost({
          visit_environment: 'outdoor',
          duration_type: 'half_day',
          photo_urls: ['https://example.com/photo1.jpg'],
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /행복어린이공원/ }));

    expect(await screen.findByRole('dialog', { name: '게시글 상세' })).toBeInTheDocument();
    expect(screen.getByText(/2026\.09\.04/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/photo1.jpg');
  });

  it('사진이 없어도 카드는 정상 렌더링되고, 상세를 열어도 사진 영역이 없다', async () => {
    render(<DashboardPostCard post={basePost({ content: '짧은 소감만 남겼어요' })} />);
    expect(screen.getByText('짧은 소감만 남겼어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /행복어린이공원/ }));
    await screen.findByRole('dialog', { name: '게시글 상세' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('기존 micro_review 렌더링은 회귀 없이 그대로 동작한다', () => {
    render(<DashboardPostCard post={basePost({ post_type: 'micro_review', rating: 4, content: '좋아요' })} />);
    expect(screen.getByText('★★★★☆')).toBeInTheDocument();
    expect(screen.getByText('좋아요')).toBeInTheDocument();
  });

  it('기존 checklist 렌더링은 회귀 없이 그대로 동작한다', () => {
    render(
      <DashboardPostCard
        post={basePost({ post_type: 'checklist', checklist_answers: { parking: true, nursing_room: false, kids_chair: false, kids_menu: false, diaper_table: false } })}
      />
    );
    expect(screen.getByText('✓ 주차 편의')).toBeInTheDocument();
    expect(screen.queryByText('✓ 수유실 유무')).not.toBeInTheDocument();
  });

  it('is_adopted(채택)이면 제목 앞에 ✨ 표시가 붙는다', () => {
    render(<DashboardPostCard post={basePost({ is_adopted: true })} />);
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '✨행복어린이공원')).toBeInTheDocument();
  });
});
