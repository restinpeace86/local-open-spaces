import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KakaoLoginButton } from './kakao-login-button';
import { GoogleLoginButton } from './google-login-button';

const signInWithOAuthMock = vi.fn(() => Promise.resolve({ data: {}, error: null }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: signInWithOAuthMock } }),
}));

// [Decision 018](2026-09-02) 요구사항: 두 버튼 모두 provider만 다르게 넘기고 나머지
// (redirectTo)는 동일해야 한다. window.location.origin을 실제로 참조하는지도 검증한다.
describe('KakaoLoginButton / GoogleLoginButton', () => {
  afterEach(() => {
    signInWithOAuthMock.mockClear();
  });

  it('카카오 버튼은 브랜드 컬러(#FEE500)와 지정된 문구를 노출한다', () => {
    render(<KakaoLoginButton />);
    const button = screen.getByText('카카오로 3초 만에 시작하기').closest('button')!;
    expect(button).toHaveStyle({ backgroundColor: '#FEE500' });
  });

  it('카카오 버튼 클릭 시 provider="kakao"와 콜백 redirectTo로 signInWithOAuth를 호출한다', async () => {
    render(<KakaoLoginButton />);
    fireEvent.click(screen.getByText('카카오로 3초 만에 시작하기'));

    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: 'kakao',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  });

  it('구글 버튼 클릭 시 provider="google"와 동일한 콜백 redirectTo로 signInWithOAuth를 호출한다', async () => {
    render(<GoogleLoginButton />);
    fireEvent.click(screen.getByText('구글로 시작하기'));

    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  });

  it('로그인 요청이 에러를 반환하면 콘솔에 남기고 onError 콜백을 호출한다', async () => {
    signInWithOAuthMock.mockResolvedValueOnce({ data: {}, error: { message: '일시적 오류' } } as never);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();

    render(<KakaoLoginButton onError={onError} />);
    fireEvent.click(screen.getByText('카카오로 3초 만에 시작하기'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('일시적 오류'));
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
