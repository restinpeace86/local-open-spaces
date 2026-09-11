import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// [맘스픽 메인 화면 투명 오버레이 온보딩 패턴](2026-09-10 사용자 지시, todo.md
// 개선사항4): not_sprout_yet(로그인 O, 첫 글 X)에서 피드는 배경 프리뷰로 보이되,
// 피드 터치는 투명 인터셉트 레이어가 가로채 안내 팝업을 띄운다.

const mockAccessState = { current: 'not_sprout_yet' as string };
// 안정적인 참조를 반환한다 — MomPickView가 useEffect([initialProfile])로 profile을
// 동기화하므로, 매 렌더마다 새 객체를 주면 무한 리렌더가 발생한다.
vi.mock('@/hooks/use-mom-pick-access', () => {
  const profile = { grade: 'signed_up', birth_years: [] as number[] };
  return { useMomPickAccess: () => ({ state: mockAccessState.current, profile }) };
});
vi.mock('@/lib/auth/profile', () => {
  const profile = { grade: 'signed_up', birth_years: [] as number[] };
  return { getMyProfile: () => Promise.resolve(profile) };
});
vi.mock('./survey-review-composer', () => ({
  SurveyReviewComposer: () => <div data-testid="composer">설문형 리뷰 작성 폼</div>,
}));
vi.mock('./personalized-banner', () => ({ PersonalizedBanner: () => <div /> }));
// 소셜 로그인 버튼(supabase OAuth)을 실제로 렌더하지 않도록 모달을 가볍게 스텁.
vi.mock('./login-prompt-modal', () => ({
  LoginPromptModal: () => <div>👑 맘스픽은 로그인 후 이용할 수 있어요</div>,
}));

import { MomPickView } from './mom-pick-view';

// 섹션 헤더만 검증하므로 카드는 비워둔다(DashboardPostCard 렌더링 회피).
const DASHBOARD = { expert: [], trending: [], live: [] };

function stubDashboardFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(DASHBOARD) } as Response))
  );
}

describe('MomPickView — 투명 오버레이 온보딩(개선사항4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockAccessState.current = 'not_sprout_yet';
  });

  it('not_sprout_yet: 진입 즉시 안내 모달을 자동으로 띄우지 않고 피드를 프리뷰로 보여준다', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    // 피드(배경)는 렌더된다.
    expect(await screen.findByText('🔥 인기 · 우수글')).toBeInTheDocument();
    // 안내 모달은 자동으로 뜨지 않는다.
    expect(screen.queryByText('🌱 아직 새싹맘 등급이 아니에요!')).not.toBeInTheDocument();
  });

  it('not_sprout_yet: 피드 위 투명 레이어를 터치하면 안내 팝업이 뜬다', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    fireEvent.click(screen.getByLabelText('첫 글을 작성하고 맘스픽 모든 기능 이용하기'));

    expect(await screen.findByText('🌱 아직 새싹맘 등급이 아니에요!')).toBeInTheDocument();
  });

  // [맘스픽 첫 글쓰기 소프트월 통일](2026-09-12 사용자 지시): "첫글은 안 쓴 상태면
  // 맘스픽 내용만 보여야지, 첫글쓰기의 장소선택이 같이 보이면 안 된다.. 뭔가 눌러서
  // 보려는 액션을 하면 그때 팝업이 떠서 권한이 없다고 하면서 첫 글 쓰러 가자고 해야".
  it('not_sprout_yet: 진입 시 글쓰기 폼(장소선택 포함)은 렌더되지 않고, guest와 동일한 소프트월 버튼만 보인다', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
    expect(screen.getByText('✍️ 첫 글 쓰고 맘스픽 시작하기')).toBeInTheDocument();
  });

  it('not_sprout_yet: 소프트월 버튼을 누르면 안내 팝업이 뜬다(권한 없음 안내)', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    fireEvent.click(screen.getByText('✍️ 첫 글 쓰고 맘스픽 시작하기'));

    expect(await screen.findByText('🌱 아직 새싹맘 등급이 아니에요!')).toBeInTheDocument();
    expect(screen.queryByTestId('composer')).not.toBeInTheDocument();
  });

  it('not_sprout_yet: 안내 팝업의 "첫 글 쓰러 가기"를 눌러야 비로소 글쓰기 폼이 나타난다', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    fireEvent.click(screen.getByText('✍️ 첫 글 쓰고 맘스픽 시작하기'));
    fireEvent.click(await screen.findByText('첫 글 쓰러 가기'));

    expect(await screen.findByTestId('composer')).toBeInTheDocument();
    expect(screen.queryByText('🌱 아직 새싹맘 등급이 아니에요!')).not.toBeInTheDocument();
  });

  it('allowed: 투명 인터셉트 레이어가 없다', async () => {
    mockAccessState.current = 'allowed';
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    expect(screen.queryByLabelText('첫 글을 작성하고 맘스픽 모든 기능 이용하기')).not.toBeInTheDocument();
  });

  // [2026-09-11 사용자 지시] 비로그인(guest)도 미리보기는 보되 '전체보기' 등
  // 클릭은 막고 로그인으로 유도한다(PC에서 그냥 눌려 들어가지던 문제).
  it('guest: 피드는 프리뷰로 보이고, 피드 위 투명 레이어를 누르면 로그인 프롬프트가 뜬다', async () => {
    mockAccessState.current = 'guest';
    stubDashboardFetch();
    render(<MomPickView />);

    expect(await screen.findByText('🔥 인기 · 우수글')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('로그인하고 맘스픽 커뮤니티 이용하기'));

    // LoginPromptModal이 뜬다.
    expect(await screen.findByText('👑 맘스픽은 로그인 후 이용할 수 있어요')).toBeInTheDocument();
  });

  it('guest: 안내 모달(새싹맘)이 아니라 로그인 프롬프트로 분기한다', async () => {
    mockAccessState.current = 'guest';
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    fireEvent.click(screen.getByLabelText('로그인하고 맘스픽 커뮤니티 이용하기'));

    expect(screen.queryByText('🌱 아직 새싹맘 등급이 아니에요!')).not.toBeInTheDocument();
  });
});
