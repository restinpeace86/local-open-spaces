import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';
import { PartnerEmailAuthForm } from '@/components/partner/email-auth-form';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 3절):
// "/partner/login 경로를 통해 공급자 전용 모바일 퍼스트 로그인 화면부터 시작(google
// or kakao 인증)". 기존 로그인 버튼(kakao-login-button.tsx/google-login-button.tsx)을
// callbackPath만 파트너 전용 콜백(/partner/auth/callback)으로 바꿔 그대로 재사용한다
// (제5장 제4조 기존 구조 우선) — "상호명, 스팟 연동 등 추가 입력란"은 로그인 자체가
// 아니라 로그인 이후 온보딩 단계(/partner/onboarding, 다음 단계에서 실제 폼 구현)의
// 몫이라 이 화면에는 없다.
//
// [개선사항 5 — 이메일 로그인/회원가입 추가](2026-09-22 사용자 지시, todo.md):
// 소셜 로그인 버튼 아래에 이메일 로그인/회원가입 폼(PartnerEmailAuthForm)을
// 추가한다. 관리자(HQ) 권한은 로그인 방식과 무관하게 세션의 이메일만 보므로
// (src/lib/hq/is-hq-staff.ts), 이 폼으로 로그인해도 goodguy10r@naver.com이면
// 동일하게 HQ 권한이 적용된다 — 별도 처리 불필요.
//
// [스크롤 버그 예방](개선사항 4와 동일한 원인 — src/app/layout.tsx의 body가 고정
// 높이+overflow-hidden): 이메일 폼이 추가돼 콘텐츠가 길어지면 작은 화면에서
// 넘칠 수 있어, 온보딩 페이지와 동일하게 `h-dvh`(고정) 대신 `flex-1
// overflow-y-auto`(자체 스크롤)로 미리 바꿔둔다.
export default function PartnerLoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 overflow-y-auto bg-white p-6 text-center">
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
      <PartnerEmailAuthForm />
    </div>
  );
}
