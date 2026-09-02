'use client';

import { createClient } from '@/lib/supabase/client';

// [Decision 018](2026-09-02) / 카카오 브랜드 가이드: 시그니처 컬러 #FEE500 배경 + 짙은
// 텍스트(#191919, 카카오 로그인 버튼 가이드 공식 텍스트 색). 아이콘은 카카오 말풍선
// 모양을 단순화한 인라인 SVG로 근사했다 — 정확한 브랜드 자산이 필요하면 카카오
// 디벨로퍼스의 공식 로그인 버튼 이미지로 교체를 권장한다(추측 근사치임을 명시).
export function KakaoLoginButton({ onError }: { onError?: (message: string) => void }) {
  async function handleClick() {
    const supabase = createClient();
    // 요구사항: provider만 다르고 나머지(redirectTo)는 구글 버튼과 동일한 콜백 경로를 쓴다.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      // 요구사항 2 "에러를 콘솔 또는 UI 상에서 확인 가능하도록" — 둘 다 한다.
      console.error('[KakaoLoginButton] 로그인 요청 실패:', error.message);
      onError?.(error.message);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-[#191919] transition-opacity hover:opacity-90"
      style={{ backgroundColor: '#FEE500' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#191919" aria-hidden>
        <path d="M12 3C6.48 3 2 6.48 2 10.7c0 2.7 1.8 5.07 4.5 6.42-.2.72-.72 2.6-.83 3.02-.13.5.19.5.4.36.16-.1 2.6-1.76 3.65-2.48.74.1 1.5.16 2.28.16 5.52 0 10-3.48 10-7.68C22 6.48 17.52 3 12 3z" />
      </svg>
      카카오로 3초 만에 시작하기
    </button>
  );
}
