'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// [개선사항 5](2026-09-22 사용자 지시, todo.md): "카카오/구글 소셜 로그인만
// 지원하는 PMS 로그인 화면에 이메일/비밀번호 로그인·회원가입 추가". Supabase
// Auth 프로젝트 실제 설정을 확인했다(Management API로 직접 조회, 추측 금지):
// `password_min_length: 6`, `mailer_autoconfirm: false`(가입 즉시 세션이 오지
// 않고 확인 이메일을 눌러야 로그인 가능) — 아래 로직은 이 두 가지를 그대로
// 반영한다.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (message.includes('User already registered')) return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (message.includes('Password should be at least')) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  if (message.includes('Email not confirmed')) return '이메일 확인이 아직 안 됐어요. 메일함에서 확인 링크를 눌러주세요.';
  // [실측 확인](2026-09-22): 이 프로젝트 Supabase 프로젝트는 커스텀 SMTP가 설정돼
  // 있지 않아(smtp_host=null) Supabase 기본 메일 발송 한도(rate_limit_email_sent,
  // 실측 시간당 2건)가 그대로 적용된다 — 실제 회원가입 폼으로 테스트 중 이 에러를
  // 직접 재현해 확인했다. 짧은 시간에 여러 명이 가입을 시도하면 쉽게 발생할 수 있어
  // 원문 그대로 노출하지 않고 안내 문구로 바꾼다.
  if (message.includes('email rate limit exceeded')) return '이메일 발송 요청이 많아 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.';
  return message;
}

type Mode = 'login' | 'signup';

export function PartnerEmailAuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  function switchMode(next: Mode) {
    if (mode === next) return;
    setMode(next);
    setErrorMessage(null);
    setInfoMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMessage('올바른 이메일 형식을 입력해 주세요.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (error) {
          setErrorMessage(translateAuthError(error.message));
          return;
        }
        // [나드리픽 파트너 PMS 미들웨어](src/middleware.ts): 로그인 성공 후 이
        // 경로로 이동하면, partners 행이 없는 신규 가입자는 미들웨어가 자동으로
        // /partner/onboarding으로 되돌려보낸다(소셜 로그인과 동일한 관례,
        // 회원가입/로그인 방식과 무관하게 온보딩 분기 로직은 하나로 통일돼 있음).
        router.push('/partner/today');
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
        if (error) {
          setErrorMessage(translateAuthError(error.message));
          return;
        }
        // [이메일 확인 필요] mailer_autoconfirm=false라 signUp 직후에는 세션이
        // 없다(data.session === null) — 사용자가 이메일의 확인 링크를 눌러야
        // 로그인할 수 있다. 세션이 있으면(프로젝트 설정이 바뀐 경우 대비) 곧바로
        // 온보딩으로 보낸다.
        if (!data.session) {
          setInfoMessage('가입 확인 이메일을 보냈어요. 메일함에서 확인 링크를 누른 뒤 로그인해 주세요.');
          setMode('login');
          setPassword('');
        } else {
          router.push('/partner/today');
          router.refresh();
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '처리 중 오류가 발생했어요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-xs">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">또는</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <div className="mb-3 flex rounded-lg bg-gray-100 p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => switchMode('login')}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            mode === 'login' ? 'bg-white text-gray-900 shadow' : 'text-gray-500'
          }`}
        >
          이메일로 로그인
        </button>
        <button
          type="button"
          onClick={() => switchMode('signup')}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            mode === 'signup' ? 'bg-white text-gray-900 shadow' : 'text-gray-500'
          }`}
        >
          이메일로 회원가입
        </button>
      </div>

      {/* noValidate: type="email"/required가 유발하는 브라우저 기본 유효성 검사
          팝업(언어/스타일이 이 앱과 안 맞음) 대신, 위 handleSubmit의 일관된
          한국어 에러 메시지를 항상 쓴다. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2.5 text-left">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          required
          className="rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`비밀번호(${MIN_PASSWORD_LENGTH}자 이상)`}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
        {infoMessage && <p className="text-xs text-emerald-600">{infoMessage}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
        </button>
      </form>
    </div>
  );
}
