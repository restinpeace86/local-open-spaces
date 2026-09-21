import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 9절):
// "본사 운영진 전용 /admin/login 및 대시보드 진입 뼈대 라우트 분리" — /admin/*은 이미
// 이 코드베이스의 인증 없는 콘텐츠 큐레이션 관리자 화면이 쓰고 있어 경로가 충돌해
// /hq/*로 분리했다(사용자 확인).
//
// [HQ 역할 검증 추가](2026-09-22 사용자 지시): 이메일 화이트리스트에 없는 계정으로
// 로그인하면 middleware.ts가 `?forbidden=1`을 달아 이 화면으로 되돌려보낸다 — 그냥
// 조용히 튕기면 "로그인이 실패했나?"로 오해할 수 있어 이유를 명확히 보여준다
// (auth_error=1 관례와 동일한 쿼리 파라미터 기반 안내, my-page-view.tsx 참고).
export default async function HqLoginPage({ searchParams }: { searchParams: Promise<{ forbidden?: string }> }) {
  const { forbidden } = await searchParams;

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-white p-6 text-center">
      <span className="text-3xl" aria-hidden>
        🏢
      </span>
      <h1 className="text-lg font-bold text-gray-900">나드리픽 HQ</h1>
      <p className="mt-1 text-sm text-gray-500">본사 운영진 전용 관리 콘솔이에요.</p>
      {forbidden && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          이 계정은 HQ 권한이 없어요. 등록된 본사 운영진 계정으로 로그인해 주세요.
        </p>
      )}
      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <KakaoLoginButton callbackPath="/hq/auth/callback" />
        <GoogleLoginButton callbackPath="/hq/auth/callback" />
      </div>
    </div>
  );
}
