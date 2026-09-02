'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// 로그인 버튼 2종과 짝을 이루는 로그아웃 액션 — 소셜 로그인 기능을 실제로 화면에서
// 왕복 검증하려면 로그인만큼 로그아웃도 필요하다(별도 요구사항엔 없었지만, 로그인
// 버튼만 있고 로그아웃이 없으면 /my 화면 자체를 실사용/검증할 수 없어 최소한으로 추가).
export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[SignOutButton] 로그아웃 실패:', error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
    >
      로그아웃
    </button>
  );
}
