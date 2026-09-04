import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardPostCard } from './dashboard-post-card';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

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
// 타입 카드 렌더링 — 설문 요약 뱃지 + 자유글 + 사진 썸네일을 보여주는지 검증한다.
// 기존 micro_review/checklist 렌더링은 회귀 없이 그대로 유지돼야 한다(과거 데이터
// 하위 호환).
describe('DashboardPostCard', () => {
  it('survey_review는 연령대/방문환경/체류시간/만족포인트를 뱃지로, 자유글과 사진을 함께 보여준다', () => {
    render(
      <DashboardPostCard
        post={basePost({
          age_groups: ['영유아', '미취학'],
          visit_environment: 'outdoor',
          duration_type: 'half_day',
          satisfaction_points: ['parking'],
          content: '아이가 정말 좋아했어요',
          photo_urls: ['https://example.com/photo1.jpg'],
        })}
      />
    );

    expect(screen.getByText('영유아')).toBeInTheDocument();
    expect(screen.getByText('미취학')).toBeInTheDocument();
    expect(screen.getByText('☀️ 탁 트인 야외')).toBeInTheDocument();
    expect(screen.getByText('⏱️ 반나절 코스 (3~4시간)')).toBeInTheDocument();
    expect(screen.getByText('주차 편리 🚗')).toBeInTheDocument();
    expect(screen.getByText('아이가 정말 좋아했어요')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/photo1.jpg');
  });

  it('survey_review인데 설문/사진이 전부 비어있어도(전부 선택 사항) 에러 없이 렌더링된다', () => {
    render(<DashboardPostCard post={basePost({ content: '짧은 소감만 남겼어요' })} />);
    expect(screen.getByText('짧은 소감만 남겼어요')).toBeInTheDocument();
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
});
