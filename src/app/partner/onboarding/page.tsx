// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 3절):
// 로그인은 했지만 아직 partners 테이블에 본인 행이 없는 사용자가 미들웨어(middleware.ts)
// 에 의해 도착하는 곳 — "상호명, 나드리픽 스팟과의 위치연동 등" 온보딩 입력 폼은 이번
// Phase 1 범위(DB 스키마/미들웨어/하단 탭바 뼈대) 밖이라 다음 단계에서 실제로 채운다.
// 지금은 그 화면이 존재해야 미들웨어 리다이렉트가 깨진 링크로 떨어지지 않는다.
export default function PartnerOnboardingPage() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-white p-6 text-center">
      <span className="text-3xl" aria-hidden>
        🚧
      </span>
      <h1 className="text-lg font-bold text-gray-900">파트너 등록 준비 중이에요</h1>
      <p className="mt-1 text-sm text-gray-500">
        상호명과 스팟 연동 정보를 입력하는 화면을 곧 열어드릴게요.
      </p>
    </div>
  );
}
