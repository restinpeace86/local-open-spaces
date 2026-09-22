import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerEmailAuthForm } from './email-auth-form';

const signInWithPasswordMock = vi.fn();
const signUpMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (args: unknown) => signInWithPasswordMock(args),
      signUp: (args: unknown) => signUpMock(args),
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

// [개선사항 5](2026-09-22 사용자 지시, todo.md): 이메일 로그인/회원가입 폼의
// 유효성 검증, Supabase Auth 연동, 이메일 확인 필요(mailer_autoconfirm=false)
// 안내를 검증한다.
describe('PartnerEmailAuthForm', () => {
  afterEach(() => {
    signInWithPasswordMock.mockReset();
    signUpMock.mockReset();
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  function fillAndSubmit(email: string, password: string) {
    fireEvent.change(screen.getByPlaceholderText('이메일'), { target: { value: email } });
    fireEvent.change(screen.getByPlaceholderText(/비밀번호/), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: /^(로그인|회원가입)$/ }));
  }

  it('기본값은 로그인 모드다', () => {
    render(<PartnerEmailAuthForm />);
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('회원가입 탭을 누르면 버튼 라벨이 바뀐다', () => {
    render(<PartnerEmailAuthForm />);
    fireEvent.click(screen.getByText('이메일로 회원가입'));
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument();
  });

  it('이메일 형식이 올바르지 않으면 에러를 보여주고 Supabase를 호출하지 않는다', async () => {
    render(<PartnerEmailAuthForm />);
    fillAndSubmit('not-an-email', 'password123');
    expect(await screen.findByText('올바른 이메일 형식을 입력해 주세요.')).toBeInTheDocument();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('비밀번호가 6자 미만이면 에러를 보여주고 Supabase를 호출하지 않는다', async () => {
    render(<PartnerEmailAuthForm />);
    fillAndSubmit('owner@example.com', '123');
    expect(await screen.findByText('비밀번호는 6자 이상이어야 합니다.')).toBeInTheDocument();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('로그인 성공 시 /partner/today로 이동하고 새로고침한다', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null });
    render(<PartnerEmailAuthForm />);
    fillAndSubmit('owner@example.com', 'password123');

    await waitFor(() =>
      expect(signInWithPasswordMock).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'password123' })
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/partner/today'));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('로그인 실패 시 알기 쉬운 한국어 에러 메시지를 보여준다', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<PartnerEmailAuthForm />);
    fillAndSubmit('owner@example.com', 'password123');

    expect(await screen.findByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('회원가입 성공(이메일 확인 필요, 세션 없음) 시 안내 메시지를 보여주고 로그인 모드로 되돌아간다', async () => {
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });
    render(<PartnerEmailAuthForm />);
    fireEvent.click(screen.getByText('이메일로 회원가입'));
    fillAndSubmit('new-owner@example.com', 'password123');

    await waitFor(() => expect(signUpMock).toHaveBeenCalledWith({ email: 'new-owner@example.com', password: 'password123' }));
    expect(await screen.findByText('가입 확인 이메일을 보냈어요. 메일함에서 확인 링크를 누른 뒤 로그인해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('회원가입 시 세션이 즉시 발급되면(프로젝트 설정이 바뀐 경우 대비) 바로 이동한다', async () => {
    signUpMock.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null });
    render(<PartnerEmailAuthForm />);
    fireEvent.click(screen.getByText('이메일로 회원가입'));
    fillAndSubmit('new-owner@example.com', 'password123');

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/partner/today'));
  });

  it('이메일 발송 한도 초과 에러(실측 확인된 케이스)도 알기 쉬운 메시지로 바꿔 보여준다', async () => {
    signUpMock.mockResolvedValue({ data: { session: null }, error: { message: 'email rate limit exceeded' } });
    render(<PartnerEmailAuthForm />);
    fireEvent.click(screen.getByText('이메일로 회원가입'));
    fillAndSubmit('new-owner@example.com', 'password123');

    expect(await screen.findByText('이메일 발송 요청이 많아 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('이미 가입된 이메일로 회원가입하면 알기 쉬운 에러 메시지를 보여준다', async () => {
    signUpMock.mockResolvedValue({ data: { session: null }, error: { message: 'User already registered' } });
    render(<PartnerEmailAuthForm />);
    fireEvent.click(screen.getByText('이메일로 회원가입'));
    fillAndSubmit('existing@example.com', 'password123');

    expect(await screen.findByText('이미 가입된 이메일이에요. 로그인해 주세요.')).toBeInTheDocument();
  });
});
