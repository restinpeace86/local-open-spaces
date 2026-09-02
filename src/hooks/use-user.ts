'use client';

import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// [Decision 018](2026-09-02): 클라이언트 컴포넌트에서 현재 로그인 상태를 구독하는 공용
// 훅. onAuthStateChange를 구독해 로그인/로그아웃/토큰 갱신이 일어날 때마다 자동으로
// 최신 사용자 정보를 반영한다(페이지를 새로고침하지 않아도 로그인 버튼 ↔ 프로필 UI가
// 즉시 전환됨).
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUser(data.user);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
