import { PartnerBottomTabs } from '@/components/partner/partner-bottom-tabs';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 2절/5절):
// 하단 탭바는 "오늘/주간/월간/더보기" 4개 실제 탭 화면에만 적용돼야 한다 — 로그인
// (/partner/login)과 온보딩(/partner/onboarding)은 아직 그 4개 탭에 속하지 않는 화면
// (로그인 전이거나, 아직 파트너 등록이 안 끝난 상태)이라 탭바가 보이면 오히려
// 어색하다. 그래서 이 레이아웃을 /partner 바로 아래가 아니라 URL에 영향을 주지 않는
// 라우트 그룹 (tabs) 안에 둬서, login/onboarding 형제 라우트는 이 레이아웃(탭바)을
// 상속하지 않게 격리한다.
//
// 소비자용 하단 탭(BottomTabs)/프로필 완성 가드는 이 트리 전체에서 보이지 않도록
// 그쪽 컴포넌트들을 pathname 기준으로 스스로 숨기게 했다(bottom-tabs.tsx/
// profile-completion-guard.tsx 수정 참고 — route group으로 전체 소비자 라우트를
// 옮기는 대규모 리팩터 대신 최소 변경으로 격리).
//
// [PC 화면 반응형 프레임](2026-09-23 사용자 지시): "지금 /partner 쪽 인증하고
// 들어가면 모바일에서 보는사이즈가 아니고 화면이 pc 사이즈처럼되어있어" — 이
// 셸에 너비 제약이 전혀 없어서, 넓은 데스크톱 창에서는 하단 탭바와 콘텐츠가
// 화면 끝까지 늘어나 버튼 간격이 어색하게 벌어지는 등 "모바일 UI가 그대로
// 늘어난" 모습이 됐다(실측: 1440px 데스크톱 뷰포트로 캡처해 확인). 모바일
// 폭에서는 기존과 동일하게 화면 전체를 쓰고, 그보다 넓을 때만 가운데 정렬된
// 고정 폭 패널로 감싼다 — 월간 뷰의 PC 캘린더 그리드(7열)가 답답하지 않을
// 만큼 넉넉한 폭(max-w-2xl)을 골랐다.
export default function PartnerTabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-50 md:mx-auto md:max-w-2xl md:border-x md:border-gray-200">
      <div className="flex-1 overflow-y-auto">{children}</div>
      <PartnerBottomTabs />
    </div>
  );
}
