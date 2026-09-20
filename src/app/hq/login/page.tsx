import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 9절):
// "본사 운영진 전용 /admin/login 및 대시보드 진입 뼈대 라우트 분리" — /admin/*은 이미
// 이 코드베이스의 인증 없는 콘텐츠 큐레이션 관리자 화면이 쓰고 있어 경로가 충돌해
// /hq/*로 분리했다(사용자 확인). Phase 1은 "본사 운영진 계정" 식별 방식이 아직 정해지지
// 않아(추측 금지) 로그인 여부만 확인하고, 실제 역할 검증은 다음 단계에서 추가한다.
export default function HqLoginPage() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-white p-6 text-center">
      <span className="text-3xl" aria-hidden>
        🏢
      </span>
      <h1 className="text-lg font-bold text-gray-900">나드리픽 HQ</h1>
      <p className="mt-1 text-sm text-gray-500">본사 운영진 전용 관리 콘솔이에요.</p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <KakaoLoginButton callbackPath="/hq/auth/callback" />
        <GoogleLoginButton callbackPath="/hq/auth/callback" />
      </div>
    </div>
  );
}
