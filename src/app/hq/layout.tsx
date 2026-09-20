// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 9절):
// HQ 대시보드는 파트너용 하단 탭바와도, 소비자용 하단 탭과도 무관한 별도 데스크톱형
// 관리 콘솔이라(사업자 본사 운영진이 대상) 독립된 최소 레이아웃만 둔다. 소비자용
// 하단 탭(BottomTabs)/프로필 완성 가드는 pathname 기준으로 이 경로에서도 스스로
// 숨는다(bottom-tabs.tsx/profile-completion-guard.tsx 수정 참고).
export default function HqLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-gray-50">{children}</div>;
}
