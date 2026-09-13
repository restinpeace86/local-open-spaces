import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LivePickCard } from './live-pick-card';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [실시간 라이브 영역 리디자인](2026-09-13 사용자 지시): "반짝이는 라이브 아이콘과
// 함께.. 타임라인형 가로 카드. 터치 시 이동: 실시간 진행 중인 이벤트 전체 목록으로
// 이동." — LIVE 뱃지, 상대 시간(n분/시간/일 전), 링크 목적지를 검증한다.
function basePost(overrides: Partial<DashboardPost> = {}): DashboardPost {
  return {
    id: 'post-1',
    post_type: 'micro_review',
    rating: 4,
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
    created_at: new Date().toISOString(),
    spotName: '행복어린이공원',
    author: { id: 'author-1', nickname: '민지맘', grade: 'sprout' },
    ...overrides,
  };
}

describe('LivePickCard', () => {
  it('LIVE 뱃지와 스팟명, 작성자를 보여준다', () => {
    render(<LivePickCard post={basePost()} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('행복어린이공원')).toBeInTheDocument();
    expect(screen.getByText(/민지맘/)).toBeInTheDocument();
  });

  it('방금 올라온 글이면 "방금 전"으로 표시된다', () => {
    render(<LivePickCard post={basePost({ created_at: new Date().toISOString() })} />);
    expect(screen.getByText(/방금 전/)).toBeInTheDocument();
  });

  it('몇 시간 전 글이면 "N시간 전"으로 표시된다', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    render(<LivePickCard post={basePost({ created_at: threeHoursAgo })} />);
    expect(screen.getByText(/3시간 전/)).toBeInTheDocument();
  });

  it('카드 전체가 /mom-pick/live로 이동하는 링크다', () => {
    render(<LivePickCard post={basePost()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mom-pick/live');
  });
});
