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
// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 2절):
// 파트너/HQ는 profiles(닉네임/자녀 출생년도)와 무관한 완전히 별도 사용자층이라(partners
// 테이블) 이 가드가 개입하면 안 된다 — "기존 코드베이스와 오염되지 않도록" 요구사항.
const EXEMPT_PATH_PREFIXES = ['/auth/complete-profile', '/auth/callback', '/partner', '/hq'];

// [성능](2026-09-23 사용자 지시): "/partner 쪽 너무 반응이 느린거 같은데.. 프론트엔드
// 랜더링이라던가에서 찾아봐" — 이 가드는 root layout에 전역 마운트돼 /partner, /hq
// 에서도 항상 렌더링됐다. 기존엔 exempt 경로 판정을 useEffect 안에서만 했는데,
// 그 안에서 걸러지기 전에 이미 useUser() 훅이 무조건 호출돼 매 페이지 로드마다
// 브라우저에서 Supabase Auth로의 불필요한 네트워크 호출(getUser) +
// onAuthStateChange 구독을 만들고 있었다(exempt 경로에서는 애초에 아무 것도
// 안 하는데도). 훅은 조건부로 호출할 수 없으므로(Rules of Hooks), exempt 여부를
// 먼저 판정하는 얇은 래퍼로 분리해 실제 로직(및 useUser())을 별도 컴포넌트로
// 옮겼다 — exempt 경로에서는 그 컴포넌트 자체가 마운트되지 않아 훅 호출 자체가
// 일어나지 않는다.
export function ProfileCompletionGuard() {
  const pathname = usePathname();
  if (EXEMPT_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return null;
  return <ProfileCompletionGuardActive pathname={pathname} />;
}

function ProfileCompletionGuardActive({ pathname }: { pathname: string | null }) {
  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  // 한 번 "완료됨"을 확인하면 세션 내내 다시 조회하지 않는다 — 페이지를 이동할 때마다
  // profiles를 매번 다시 조회하는 낭비를 막는다(완성 여부는 이 화면 자체에서 저장할
  // 때만 바뀌므로, 이 세션 동안은 다시 불완전해질 일이 없다).
  const verifiedCompleteRef = useRef(false);

  useEffect(() => {
    if (isUserLoading || !user) return;
    if (verifiedCompleteRef.current) return;

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
