import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyPageView } from './my-page-view';

const getUserMock = vi.fn();
const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const fromMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: getUserMock, onAuthStateChange: onAuthStateChangeMock }, from: fromMock }),
}));

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
    const singleMock = vi.fn(() =>
      Promise.resolve({ data: { id: 'user-1', birth_years: [2021], created_at: 't', updated_at: 't' }, error: null })
    );
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ single: singleMock }) }) });

    render(<MyPageView />);

    await waitFor(() => expect(screen.getByText('test@example.com')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByDisplayValue('2021')).toBeInTheDocument());
    expect(screen.getByText('자녀 출생년도')).toBeInTheDocument();
    expect(screen.getByText('로그아웃')).toBeInTheDocument();
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
