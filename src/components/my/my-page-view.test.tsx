import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyPageView } from './my-page-view';

const getUserMock = vi.fn();
const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const fromMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: getUserMock, onAuthStateChange: onAuthStateChangeMock }, from: fromMock }),
}));

// [todo.md 개선사항7 - 마이페이지 C영역](2026-09-04) MyReviewsSection이 추가되면서
// 로그인 상태 렌더링 시 mom_pick_posts도 함께 조회한다(listMyPosts) — profiles 조회와
// 체인 모양이 달라(.eq().order() vs .eq().single()) 같은 fromMock을 그대로 재사용하면
// 깨지므로, 테이블별로 다른 체인을 돌려주는 헬퍼로 통일한다.
function mockFromByTable(handlers: { profiles?: unknown; mom_pick_posts?: unknown[] }) {
  return (table: string) => {
    if (table === 'mom_pick_posts') {
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: handlers.mom_pick_posts ?? [], error: null }) }) }) };
    }
    return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: handlers.profiles ?? null, error: null }) }) }) };
  };
}

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ refresh: vi.fn() }),
}));

// [Decision 018](2026-09-02) / spec/common/auth-user-profile.md: 로그인 전에는 로그인
// 버튼을, 로그인 후에는 프로필 편집 화면을 보여주는 최상위 통합 동작을 검증한다.
describe('MyPageView', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    mockSearchParams = new URLSearchParams();
  });

  it('로그인하지 않은 상태면 카카오/구글 로그인 버튼을 보여준다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    render(<MyPageView />);

    await waitFor(() => expect(screen.getByText('카카오로 3초 만에 시작하기')).toBeInTheDocument());
    expect(screen.getByText('구글로 시작하기')).toBeInTheDocument();
  });

  it('로그인 상태면 프로필(자녀 출생년도) 편집 화면을 보여준다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } });
    fromMock.mockImplementation(
      mockFromByTable({ profiles: { id: 'user-1', birth_years: [2021], created_at: 't', updated_at: 't' } })
    );

    render(<MyPageView />);

    await waitFor(() => expect(screen.getByText('test@example.com')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByDisplayValue('2021')).toBeInTheDocument());
    expect(screen.getByText('자녀 출생년도')).toBeInTheDocument();
    expect(screen.getByText('로그아웃')).toBeInTheDocument();
  });

  // [todo.md 개선사항7 - 마이페이지 C영역](2026-09-04): "내가 쓴 후기" 리스트가
  // 로그인 화면에 함께 노출되는지, 빈 상태/목록 상태 둘 다 검증한다.
  it('작성한 후기가 없으면 빈 상태 안내와 CTA를 보여준다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } });
    fromMock.mockImplementation(mockFromByTable({ profiles: { id: 'user-1', birth_years: [], created_at: 't', updated_at: 't' } }));

    render(<MyPageView />);

    expect(await screen.findByText('아직 작성한 후기가 없어요. 첫 후기를 남기고 챗봇을 무제한으로 이용해 보세요!')).toBeInTheDocument();
    expect(screen.getByText('첫 후기 쓰러 가기')).toBeInTheDocument();
  });

  it('작성한 후기가 있으면 건수와 함께 컴팩트 리스트로 보여준다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } });
    fromMock.mockImplementation(
      mockFromByTable({
        profiles: { id: 'user-1', birth_years: [], created_at: 't', updated_at: 't' },
        mom_pick_posts: [
          {
            id: 'post-1',
            post_type: 'survey_review',
            content: '주차장은 넓은데 주말 오전에는 붐벼요',
            created_at: '2026-09-04T00:00:00Z',
            open_spaces: { name: '어린이대공원' },
            events: null,
            photo_urls: null,
          },
        ],
      })
    );

    render(<MyPageView />);

    expect(await screen.findByText('내가 쓴 후기 (총 1건)')).toBeInTheDocument();
    expect(screen.getByText('어린이대공원')).toBeInTheDocument();
  });

  it('콜백에서 auth_error=1로 돌아오면 에러 안내를 보여준다', async () => {
    mockSearchParams = new URLSearchParams('auth_error=1');
    getUserMock.mockResolvedValue({ data: { user: null } });
    render(<MyPageView />);

    await waitFor(() =>
      expect(screen.getByText('로그인 중 문제가 발생했어요. 다시 시도해주세요.')).toBeInTheDocument()
    );
  });
});
