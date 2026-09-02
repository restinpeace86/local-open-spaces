'use client';

import { createClient } from '@/lib/supabase/client';

// [Decision 018](2026-09-02) / 구글 디자인 가이드: 흰 배경 + 회색 테두리 + 4색 "G" 로고 +
// 진한 회색 텍스트가 구글이 권장하는 "Sign in with Google" 버튼의 기본 스타일이다. "G"
// 로고는 공식 4색 배색을 근사한 인라인 SVG다 — 정확한 브랜드 자산이 필요하면 구글의
// 공식 브랜드 리소스 다운로드로 교체를 권장한다(추측 근사치임을 명시).
export function GoogleLoginButton({ onError }: { onError?: (message: string) => void }) {
  async function handleClick() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      console.error('[GoogleLoginButton] 로그인 요청 실패:', error.message);
      onError?.(error.message);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.89c2.28-2.1 3.56-5.2 3.56-8.82z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.89-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1C3.26 21.3 7.31 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.61l4.01 3.1c.94-2.83 3.59-4.96 6.71-4.96z"
        />
      </svg>
      구글로 시작하기
    </button>
  );
}
