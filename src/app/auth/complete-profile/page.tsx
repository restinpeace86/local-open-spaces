import { Suspense } from 'react';
import { CompleteProfileView } from '@/components/auth/complete-profile-view';

// [구글/카카오 인증 후 필수 프로필 입력](2026-09-04 사용자 지시): 인증 직후 곧바로 이
// 화면으로 이동해 닉네임/아이 출생년도를 필수로 받는다(auth/callback/route.ts,
// profile-completion-guard.tsx 참고).
// CompleteProfileView가 useSearchParams()(콜백이 넘긴 ?next= 확인용)를 쓰므로
// /my/page.tsx와 동일하게 Suspense 경계로 감싼다(Next.js 정적 프리렌더 요구사항).
export default function CompleteProfilePage() {
  return (
    <Suspense>
      <CompleteProfileView />
    </Suspense>
  );
}
