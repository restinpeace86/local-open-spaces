import { fireEvent, render, screen } from '@testing-library/react';
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
// 타입 카드 렌더링 — 설문 요약 뱃지 + 자유글 + 사진 버튼을 보여주는지 검증한다.
// 기존 micro_review/checklist 렌더링은 회귀 없이 그대로 유지돼야 한다(과거 데이터
// 하위 호환).
// [맘스픽 게시글 카드 컴팩트화](2026-09-13 사용자 지시): "글 한개가 차지하는 공간이
// 너무 커.. 사진은 사진 보기 버튼으로.. 제목 라인 우측에 닉네임/등급.. tag들도
// 너무 많네" — 제목/작성자 한 줄 배치, 태그 최대 3개+overflow, 사진은 버튼+팝업으로
// 검증한다.
describe('DashboardPostCard', () => {
  it('제목(스팟명) 줄 오른쪽에 작성자 닉네임과 등급이 함께 표시된다', () => {
    render(<DashboardPostCard post={basePost({ author: { id: 'user-1', nickname: '하린맘', grade: 'sprout' } })} />);

    expect(screen.getByText('행복어린이공원')).toBeInTheDocument();
    expect(screen.getByText('하린맘')).toBeInTheDocument();
    expect(screen.getByText('🌱 새싹맘')).toBeInTheDocument();
  });

  it('survey_review는 설문 뱃지(최대 3개)와 자유글을 보여주고, 사진은 버튼으로 대체한다', () => {
    render(
      <DashboardPostCard
        post={basePost({
          age_groups: ['영유아', '미취학'],
          visit_environment: 'outdoor',
          duration_type: 'half_day',
          satisfaction_points: ['parking'],
          content: '아이가 정말 좋아했어요',
          photo_urls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
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

    // 사진은 인라인 썸네일이 아니라 버튼으로만 보인다.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('📷 사진 2장 보기')).toBeInTheDocument();
  });

  it('사진 보기 버튼을 누르면 팝업으로 사진을 확인할 수 있다', () => {
    render(<DashboardPostCard post={basePost({ photo_urls: ['https://example.com/photo1.jpg'] })} />);

    fireEvent.click(screen.getByText('📷 사진 1장 보기'));

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/photo1.jpg');
    fireEvent.click(screen.getByLabelText('닫기'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('사진이 없으면 사진 보기 버튼 자체가 없다', () => {
    render(<DashboardPostCard post={basePost({ content: '짧은 소감만 남겼어요' })} />);
    expect(screen.getByText('짧은 소감만 남겼어요')).toBeInTheDocument();
    expect(screen.queryByText(/사진.*보기/)).not.toBeInTheDocument();
  });

  it('survey_review인데 설문/사진이 전부 비어있어도(전부 선택 사항) 에러 없이 렌더링된다', () => {
    render(<DashboardPostCard post={basePost({ content: '짧은 소감만 남겼어요' })} />);
    expect(screen.getByText('짧은 소감만 남겼어요')).toBeInTheDocument();
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
