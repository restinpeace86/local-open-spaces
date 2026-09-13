import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrendingPickCard } from './trending-pick-card';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [인기 우수글 영역 리디자인](2026-09-13 사용자 지시): "썸네일 이미지와 요약 텍스트가
// 조화로운 직사각형 컴팩트 가로 스크롤 카드(조회수나 좋아요 수 표시). 터치 시 이동:
// 인기글 전체 리스트로 이동." — 썸네일 유무에 따른 분기, 좋아요 수 표시, 링크
// 목적지를 검증한다.
function basePost(overrides: Partial<DashboardPost> = {}): DashboardPost {
  return {
    id: 'post-1',
    post_type: 'survey_review',
    rating: null,
    content: '주차도 편하고 아이가 좋아해요',
    checklist_answers: null,
    age_groups: null,
    visit_environment: null,
    satisfaction_points: null,
    duration_type: null,
    weather_tags: null,
    infra_tags: null,
    companion_type: null,
    photo_urls: null,
    like_count: 7,
    is_adopted: false,
    created_at: '2026-09-04T00:00:00Z',
    spotName: '행복어린이공원',
    author: { id: 'author-1', nickname: '민지맘', grade: 'active' },
    ...overrides,
  };
}

describe('TrendingPickCard', () => {
  it('썸네일이 없으면 플레이스홀더(📷)를 보여준다', () => {
    render(<TrendingPickCard post={basePost()} />);
    expect(screen.getByText('📷')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('썸네일이 있으면 이미지를 보여준다', () => {
    render(<TrendingPickCard post={basePost({ photo_urls: ['https://example.com/photo1.jpg'] })} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/photo1.jpg');
  });

  it('좋아요 수와 요약 텍스트(1~2줄), 작성자를 보여준다', () => {
    render(<TrendingPickCard post={basePost({ like_count: 12 })} />);
    expect(screen.getByText('❤️ 12')).toBeInTheDocument();
    expect(screen.getByText('주차도 편하고 아이가 좋아해요')).toBeInTheDocument();
    expect(screen.getByText('민지맘')).toBeInTheDocument();
  });

  it('카드 전체가 /mom-pick/trending으로 이동하는 링크다', () => {
    render(<TrendingPickCard post={basePost()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mom-pick/trending');
  });
});
