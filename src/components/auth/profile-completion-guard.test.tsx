import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileCompletionGuard } from './profile-completion-guard';

const getUserMock = vi.fn();
const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const fromMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: getUserMock, onAuthStateChange: onAuthStateChangeMock }, from: fromMock }),
}));

const replaceMock = vi.fn();
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: replaceMock }),
}));

function stubProfile(profile: Record<string, unknown> | null) {
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: profile, error: null }) }) }),
  });
}

// [구글/카카오 인증 후 필수 프로필 입력](2026-09-04 사용자 지시): "이건 기본으로 받게
// 해줘, 나중에 마이페이지에서 입력하는 게 아니고" — auth/callback의 리다이렉트만으로는
// 회원가입 폼을 닫고 나가버린 사용자를 막을 수 없으므로, 로그인 상태에서 어느 화면에
// 있든 프로필이 비어 있으면 완성 화면으로 되돌려보내는지 검증한다.
describe('ProfileCompletionGuard', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    replaceMock.mockReset();
    mockPathname = '/';
  });

  it('로그인하지 않았으면 아무 것도 하지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    render(<ProfileCompletionGuard />);

    await new Promise((r) => setTimeout(r, 0));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('로그인했지만 닉네임이 없으면 완성 화면으로 되돌려보낸다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    stubProfile({ nickname: null, birth_years: [2022] });
    mockPathname = '/mom-pick';

    render(<ProfileCompletionGuard />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/auth/complete-profile?next=%2Fmom-pick'));
  });

  it('로그인했지만 아이 출생년도가 비어 있으면 완성 화면으로 되돌려보낸다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    stubProfile({ nickname: '민지맘', birth_years: [] });

    render(<ProfileCompletionGuard />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
  });

  it('닉네임/아이 출생년도가 모두 있으면 아무 것도 하지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    stubProfile({ nickname: '민지맘', birth_years: [2022] });

    render(<ProfileCompletionGuard />);

    await new Promise((r) => setTimeout(r, 0));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('완성 화면(/auth/complete-profile) 자체에서는 확인하지 않는다(무한 리다이렉트 방지)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    stubProfile({ nickname: null, birth_years: [] });
    mockPathname = '/auth/complete-profile';

    render(<ProfileCompletionGuard />);

    await new Promise((r) => setTimeout(r, 0));
    expect(fromMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
