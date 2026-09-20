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
export default function PartnerTabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-50">
      <div className="flex-1 overflow-y-auto">{children}</div>
      <PartnerBottomTabs />
    </div>
  );
}
