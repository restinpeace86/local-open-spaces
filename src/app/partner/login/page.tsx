import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 3절):
// "/partner/login 경로를 통해 공급자 전용 모바일 퍼스트 로그인 화면부터 시작(google
// or kakao 인증)". 기존 로그인 버튼(kakao-login-button.tsx/google-login-button.tsx)을
// callbackPath만 파트너 전용 콜백(/partner/auth/callback)으로 바꿔 그대로 재사용한다
// (제5장 제4조 기존 구조 우선) — "상호명, 스팟 연동 등 추가 입력란"은 로그인 자체가
// 아니라 로그인 이후 온보딩 단계(/partner/onboarding, 다음 단계에서 실제 폼 구현)의
// 몫이라 이 화면에는 없다.
export default function PartnerLoginPage() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-white p-6 text-center">
      <span className="text-3xl" aria-hidden>
        🌾
      </span>
      <h1 className="text-lg font-bold text-gray-900">나드리픽 파트너</h1>
      <p className="mt-1 text-sm text-gray-500">
        예약 장부를 한눈에 — 사장님 전용 공간이에요.
      </p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <KakaoLoginButton callbackPath="/partner/auth/callback" />
        <GoogleLoginButton callbackPath="/partner/auth/callback" />
      </div>
    </div>
  );
}
