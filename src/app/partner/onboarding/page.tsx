import { OnboardingForm } from '@/components/partner/onboarding-form';

// [나드리픽 파트너 PMS — 온보딩 페이지](2026-09-20 사용자 지시, docs/partner_spec.md):
// 로그인은 했지만 아직 partners 테이블에 본인 행이 없는 사용자가 미들웨어
// (src/middleware.ts)에 의해 도착하는 곳. 실제 입력 폼(농장 이름/대표자 성함/
// 연락처/대표 이미지/주소/스팟 연동)과 저장 로직(src/actions/partner/onboarding.ts)
// 을 여기서 연결한다.
//
// [개선사항 4 — 스크롤 버그 수정](2026-09-22 사용자 지시, todo.md): "화면을 아래로
// 내리려고 해도 스크롤이 작동하지 않아 하단 버튼이나 입력창에 접근할 수 없음" —
// 원인은 이 페이지 자체가 아니라 루트 레이아웃(src/app/layout.tsx)의
// `<body className="h-dvh flex flex-col overflow-hidden">`다. 이 앱은 body를
// 고정 높이+overflow-hidden으로 두고 각 화면이 자기 내부에서 스크롤하는
// 구조라(하단 탭바가 있는 소비자 앱 화면들과 동일한 셸 패턴, my-page-view.tsx의
// `flex-1 overflow-y-auto`가 동일한 전례) — 이 페이지는 `min-h-dvh`(최소 높이만
// 지정, 넘치면 그냥 넘쳐버림)를 쓰고 있어서 콘텐츠가 고정 높이 body보다 길어지면
// 스크롤할 방법이 없었다. 루트 레이아웃의 overflow-hidden은 앱 전체에 영향을
// 주므로 건드리지 않고(다른 모든 화면의 스크롤 동작에 영향), 이 페이지 자신을
// my-page-view.tsx와 동일한 `flex-1 overflow-y-auto`로 바꿔 body의 남은 공간을
// 채우면서 내부적으로 스크롤 가능하게 한다.
//
// [PC 화면 반응형 프레임](2026-09-23 사용자 지시): "화면이 pc 사이즈처럼되어있어
// 반응형으로 해야할텐데" — 폼 입력란(onboarding-form.tsx)이 자체 너비 제약이 없어
// 넓은 화면에서 그대로 늘어난다. (tabs)/layout.tsx와 동일한 폭(max-w-2xl)으로
// 맞춰 일관된 프레임을 준다.
export default function PartnerOnboardingPage() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white md:mx-auto md:w-full md:max-w-2xl md:border-x md:border-gray-200">
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
