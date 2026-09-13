import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LivePickCard } from './live-pick-card';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [실시간 라이브 영역 리디자인](2026-09-13 사용자 지시): "반짝이는 라이브 아이콘과
// 함께.. 타임라인형 가로 카드. 터치 시 이동: 실시간 진행 중인 이벤트 전체 목록으로
// 이동." — LIVE 뱃지, 상대 시간(n분/시간/일 전), 링크 목적지를 검증한다.
// [실시간 라이브 카드 한 줄 압축](2026-09-13 사용자 지시): "하린맘 이건 빼고..
// 제목하고 3시간 전.. 내용글.. 그 옆에 남는 공간만.. 한줄로 돼?" — 닉네임은
// 더 이상 렌더링되지 않고, 제목/시간/내용이 전부 한 줄에 표시되는지 검증한다.
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
    spotId: 'spot-1',
    author: { id: 'author-1', nickname: '민지맘', grade: 'sprout' },
    ...overrides,
  };
}

describe('LivePickCard', () => {
  it('LIVE 뱃지와 스팟명을 보여주고, 작성자 닉네임은 더 이상 보여주지 않는다', () => {
    render(<LivePickCard post={basePost()} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('행복어린이공원')).toBeInTheDocument();
    expect(screen.queryByText(/민지맘/)).not.toBeInTheDocument();
  });

  it('제목/시간/내용이 한 줄(같은 행)에 함께 표시된다', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    render(<LivePickCard post={basePost({ created_at: threeHoursAgo, content: '아이가 정말 좋아했어요' })} />);

    const timeEl = screen.getByText('3시간 전');
    const contentEl = screen.getByText(/아이가 정말 좋아했어요/);
    const titleEl = screen.getByText('행복어린이공원');
    // 같은 flex row 컨테이너(부모) 안에 셋 다 들어있어야 한 줄로 배치된다.
    expect(timeEl.parentElement).toBe(contentEl.parentElement);
    expect(timeEl.parentElement).toBe(titleEl.parentElement);
  });

  it('내용글이 없으면 내용 영역 없이 제목/시간만 한 줄로 표시된다', () => {
    render(<LivePickCard post={basePost({ content: null })} />);
    expect(screen.getByText('행복어린이공원')).toBeInTheDocument();
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
