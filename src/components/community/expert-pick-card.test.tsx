import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpertPickCard } from './expert-pick-card';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [파워맘·우수맘 추천 영역 리디자인](2026-09-13 사용자 지시): "작성자 프로필 사진이
// 큼직하게 들어간 원형 아바타 중심의 가로 카드(누가 썼는지 사람이 먼저 보이게).
// 터치 시 이동: 우수맘들이 작성한 큐레이션 리스트 목록 화면으로 즉시 이동." —
// 프로필 사진 컬럼이 없어(실측 확인) 닉네임 첫 글자 아바타로 대체했는지, 카드
// 전체가 /mom-pick/expert로 가는 링크인지 검증한다.
function basePost(overrides: Partial<DashboardPost> = {}): DashboardPost {
  return {
    id: 'post-1',
    post_type: 'survey_review',
    rating: null,
    content: '아이가 정말 좋아했어요',
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
    spotId: 'spot-1',
    author: { id: 'author-1', nickname: '하린맘', grade: 'power' },
    ...overrides,
  };
}

describe('ExpertPickCard', () => {
  it('닉네임 첫 글자 아바타, 닉네임/등급, 스팟명, 내용 1줄을 보여준다', () => {
    render(<ExpertPickCard post={basePost()} />);

    expect(screen.getByText('하')).toBeInTheDocument();
    expect(screen.getByText('하린맘')).toBeInTheDocument();
    expect(screen.getByText('✨ 파워맘')).toBeInTheDocument();
    expect(screen.getByText('행복어린이공원')).toBeInTheDocument();
    expect(screen.getByText('아이가 정말 좋아했어요')).toBeInTheDocument();
  });

  it('카드 전체가 /mom-pick/expert로 이동하는 링크다', () => {
    render(<ExpertPickCard post={basePost()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mom-pick/expert');
  });

  it('is_adopted면 스팟명 앞에 ✨가 붙는다', () => {
    render(<ExpertPickCard post={basePost({ is_adopted: true })} />);
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '✨행복어린이공원')).toBeInTheDocument();
  });

  it('닉네임이 없으면 "이름 없는 맘"과 그 첫 글자로 대체된다', () => {
    render(<ExpertPickCard post={basePost({ author: { id: 'author-1', nickname: null, grade: 'excellent' } })} />);
    expect(screen.getByText('이름 없는 맘')).toBeInTheDocument();
    expect(screen.getByText('이')).toBeInTheDocument();
  });
});
