import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginPromptModal } from './login-prompt-modal';

vi.mock('@/components/auth/kakao-login-button', () => ({ KakaoLoginButton: () => <button>카카오</button> }));
vi.mock('@/components/auth/google-login-button', () => ({ GoogleLoginButton: () => <button>구글</button> }));

describe('LoginPromptModal', () => {
  it('title/description을 생략하면 기존 맘스픽 문구를 그대로 보여준다(기존 호출부 회귀 방지)', () => {
    render(<LoginPromptModal onClose={() => {}} />);
    expect(screen.getByText('👑 맘스픽은 로그인 후 이용할 수 있어요')).toBeInTheDocument();
  });

  it('title/description을 넘기면 그 문구로 override된다(2026-10-08 문화센터 재사용)', () => {
    render(<LoginPromptModal onClose={() => {}} title="🏫 문화센터는 로그인 후 이용할 수 있어요" description="아이 연령에 맞는 강좌를 찾아보세요." />);
    expect(screen.getByText('🏫 문화센터는 로그인 후 이용할 수 있어요')).toBeInTheDocument();
    expect(screen.getByText('아이 연령에 맞는 강좌를 찾아보세요.')).toBeInTheDocument();
    expect(screen.queryByText('👑 맘스픽은 로그인 후 이용할 수 있어요')).not.toBeInTheDocument();
  });
});
