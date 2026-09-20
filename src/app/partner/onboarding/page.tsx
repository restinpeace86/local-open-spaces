import { OnboardingForm } from '@/components/partner/onboarding-form';

// [나드리픽 파트너 PMS — 온보딩 페이지](2026-09-20 사용자 지시, docs/partner_spec.md):
// 로그인은 했지만 아직 partners 테이블에 본인 행이 없는 사용자가 미들웨어
// (src/middleware.ts)에 의해 도착하는 곳. 실제 입력 폼(농장 이름/대표자 성함/
// 연락처/대표 이미지/주소/스팟 연동)과 저장 로직(src/actions/partner/onboarding.ts)
// 을 여기서 연결한다.
export default function PartnerOnboardingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="px-5 pt-8 pb-2 text-center">
        <span className="text-3xl" aria-hidden>
          🌾
        </span>
        <h1 className="mt-2 text-lg font-bold text-gray-900">농장 정보를 등록해 주세요</h1>
        <p className="mt-1 text-sm text-gray-500">사장님의 예약 장부를 만들기 전, 몇 가지만 알려주세요.</p>
      </div>
      <OnboardingForm />
    </div>
  );
}
