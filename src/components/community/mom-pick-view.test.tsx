import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// [맘스픽 메인 화면 투명 오버레이 온보딩 패턴](2026-09-10 사용자 지시, todo.md
// 개선사항4): not_sprout_yet(로그인 O, 첫 글 X)에서 피드는 배경 프리뷰로 보이되,
// 피드 터치는 투명 인터셉트 레이어가 가로채 안내 팝업을 띄운다.
// [맘스픽 메인 화면 항상 동일하게 노출 + 진짜 화면 전환](2026-09-13 사용자 지시):
// "로그인 유저든 비로그인 유저든.. 그냥 새싹맘 유저처럼 맘스픽 화면 동일하게
// 보여야돼.. 뭔가 누르려고 하면 그때.. 완전히 화면이 전환되어야해" — 글쓰기
// 영역도 상태와 무관하게 항상 SurveyReviewComposer를 그대로 렌더링하고(투명
// 인터셉트만 추가), 실제 액션 시 하단 탭까지 덮는 전체 화면 전환으로 이어진다.

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
    // 글쓰기 영역/피드 영역 둘 다 같은 aria-label의 인터셉트 레이어가 있다(2026-09-13
    // 사용자 지시로 둘이 동일한 트리거로 통일됨) — 그중 아무거나 눌러도 결과는 같다.
    const [first] = screen.getAllByLabelText('첫 글을 작성하고 맘스픽 모든 기능 이용하기');
    fireEvent.click(first);

    expect(await screen.findByText('🌱 아직 새싹맘 등급이 아니에요!')).toBeInTheDocument();
  });

  // [맘스픽 메인 화면 항상 동일하게 노출](2026-09-13 사용자 지시): "그냥 새싹맘
  // 유저처럼 맘스픽 화면 동일하게 보여야돼.. 로그인하러가기라던가 첫글쓰기 같은거
  // 보이면 안돼" — guest/not_sprout_yet도 이제 allowed와 완전히 동일하게
  // SurveyReviewComposer(장소선택 포함)를 그대로 렌더링한다. 예전의 소프트월
  // 버튼("로그인하고 후기 남기기"/"첫 글 쓰고 맘스픽 시작하기")은 사라진다.
  it('not_sprout_yet: 진입 시 allowed와 동일하게 글쓰기 폼이 그대로 보이지만, 투명 레이어가 실제 조작을 가로챈다', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(screen.queryByText('✍️ 첫 글 쓰고 맘스픽 시작하기')).not.toBeInTheDocument();
    expect(screen.queryByText('✍️ 로그인하고 후기 남기기')).not.toBeInTheDocument();
  });

  it('not_sprout_yet: 글쓰기 영역의 투명 레이어를 누르면 안내 팝업이 뜬다(권한 없음 안내)', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    const [composerOverlay] = screen.getAllByLabelText('첫 글을 작성하고 맘스픽 모든 기능 이용하기');
    fireEvent.click(composerOverlay);

    expect(await screen.findByText('🌱 아직 새싹맘 등급이 아니에요!')).toBeInTheDocument();
  });

  // [맘스픽 메인 화면 항상 동일하게 노출 + 진짜 화면 전환](2026-09-13 사용자 지시):
  // "지금은 첫글쓰기할때 아래 맘스픽 화면 메뉴가 같이나옴.. 공존이 아니고 글쓰기
  // 화면으로 완전히 전환되어야해" — 안내 팝업의 "첫 글 쓰러 가기"를 누르면 전체
  // 화면 글쓰기로 전환되고, 뒤에 있던 헤더/피드 등은 더 이상 보이지 않는다.
  it('not_sprout_yet: 안내 팝업의 "첫 글 쓰러 가기"를 누르면 전체 화면 글쓰기로 완전히 전환된다', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    const [composerOverlay] = screen.getAllByLabelText('첫 글을 작성하고 맘스픽 모든 기능 이용하기');
    fireEvent.click(composerOverlay);
    fireEvent.click(await screen.findByText('첫 글 쓰러 가기'));

    expect(await screen.findByText('✍️ 첫 글 쓰기')).toBeInTheDocument();
    expect(screen.queryByText('🌱 아직 새싹맘 등급이 아니에요!')).not.toBeInTheDocument();
    // 전체 화면 전환이므로 뒤의 헤더/피드는 더 이상 화면에 없다(공존하지 않음).
    expect(screen.queryByText('👑 맘스픽')).not.toBeInTheDocument();
    expect(screen.queryByText('🔥 인기 · 우수글')).not.toBeInTheDocument();
  });

  it('not_sprout_yet: 전체 화면 글쓰기의 닫기(✕)를 누르면 맘스픽 메인 화면으로 돌아간다', async () => {
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    fireEvent.click(screen.getAllByLabelText('첫 글을 작성하고 맘스픽 모든 기능 이용하기')[0]);
    fireEvent.click(await screen.findByText('첫 글 쓰러 가기'));
    await screen.findByText('✍️ 첫 글 쓰기');

    fireEvent.click(screen.getByLabelText('닫기'));

    expect(await screen.findByText('👑 맘스픽')).toBeInTheDocument();
    expect(screen.queryByText('✍️ 첫 글 쓰기')).not.toBeInTheDocument();
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
  it('guest: 진입 시 allowed와 동일하게 글쓰기 폼이 그대로 보인다("로그인하러가기" 문구 없음)', async () => {
    mockAccessState.current = 'guest';
    stubDashboardFetch();
    render(<MomPickView />);

    expect(await screen.findByText('🔥 인기 · 우수글')).toBeInTheDocument();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(screen.queryByText('✍️ 로그인하고 후기 남기기')).not.toBeInTheDocument();
  });

  it('guest: 피드는 프리뷰로 보이고, 피드 위 투명 레이어를 누르면 전체 화면 로그인으로 전환된다', async () => {
    mockAccessState.current = 'guest';
    stubDashboardFetch();
    render(<MomPickView />);

    expect(await screen.findByText('🔥 인기 · 우수글')).toBeInTheDocument();
    const [feedOverlay] = screen.getAllByLabelText('로그인하고 맘스픽 커뮤니티 이용하기');
    fireEvent.click(feedOverlay);

    // LoginPromptModal(전체 화면)이 뜬다.
    expect(await screen.findByText('👑 맘스픽은 로그인 후 이용할 수 있어요')).toBeInTheDocument();
  });

  it('guest: 글쓰기 영역의 투명 레이어를 눌러도 동일하게 로그인 화면으로 전환된다', async () => {
    mockAccessState.current = 'guest';
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    const [composerOverlay] = screen.getAllByLabelText('로그인하고 맘스픽 커뮤니티 이용하기');
    fireEvent.click(composerOverlay);

    expect(await screen.findByText('👑 맘스픽은 로그인 후 이용할 수 있어요')).toBeInTheDocument();
  });

  it('guest: 안내 모달(새싹맘)이 아니라 로그인 프롬프트로 분기한다', async () => {
    mockAccessState.current = 'guest';
    stubDashboardFetch();
    render(<MomPickView />);

    await screen.findByText('🔥 인기 · 우수글');
    fireEvent.click(screen.getAllByLabelText('로그인하고 맘스픽 커뮤니티 이용하기')[0]);

    expect(screen.queryByText('🌱 아직 새싹맘 등급이 아니에요!')).not.toBeInTheDocument();
  });
});
