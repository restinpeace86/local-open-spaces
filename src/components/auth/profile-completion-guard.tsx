'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/hooks/use-user';
import { getMyProfile } from '@/lib/auth/profile';

// [구글/카카오 인증 후 필수 프로필 입력](2026-09-04 사용자 지시): "이건 기본으로 받게
// 해줘, 나중에 마이페이지에서 입력하는 게 아니고." `auth/callback/route.ts`의 리다이렉트
// 만으로는 "회원가입 폼을 보여주고 닫아버린 뒤 다시는 안 채우는" 사용자를 막을 수 없다
// (세션이 이미 있으면 이후 방문은 콜백을 다시 거치지 않는다) — 로그인 상태에서 어느
// 화면으로 이동하든 프로필이 아직 비어 있으면 이 화면(전역 마운트, layout.tsx)이
// 완성 화면으로 되돌려보낸다. root layout(서버 컴포넌트)에 BottomTabs와 나란히
// 렌더링만 되는 화면 없는(return null) 가드 컴포넌트다.
const EXEMPT_PATH_PREFIXES = ['/auth/complete-profile', '/auth/callback'];

export function ProfileCompletionGuard() {
  const { user, isLoading: isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  // 한 번 "완료됨"을 확인하면 세션 내내 다시 조회하지 않는다 — 페이지를 이동할 때마다
  // profiles를 매번 다시 조회하는 낭비를 막는다(완성 여부는 이 화면 자체에서 저장할
  // 때만 바뀌므로, 이 세션 동안은 다시 불완전해질 일이 없다).
  const verifiedCompleteRef = useRef(false);

  useEffect(() => {
    if (isUserLoading || !user) return;
    if (verifiedCompleteRef.current) return;
    if (EXEMPT_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return;

    let cancelled = false;
    getMyProfile()
      .then((profile) => {
        if (cancelled || !profile) return;
        const isIncomplete = !profile.nickname || profile.birth_years.length === 0;
        if (isIncomplete) {
          router.replace(`/auth/complete-profile?next=${encodeURIComponent(pathname ?? '/my')}`);
        } else {
          verifiedCompleteRef.current = true;
        }
      })
      .catch(() => {
        // 조회 실패 시 강제 이동시키지 않는다(서비스가 중단되면 안 된다, 제5장 제11조).
      });

    return () => {
      cancelled = true;
    };
  }, [isUserLoading, user, pathname, router]);

  return null;
}
