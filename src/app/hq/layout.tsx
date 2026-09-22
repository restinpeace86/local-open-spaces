// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 9절):
// HQ 대시보드는 파트너용 하단 탭바와도, 소비자용 하단 탭과도 무관한 별도 데스크톱형
// 관리 콘솔이라(사업자 본사 운영진이 대상) 독립된 최소 레이아웃만 둔다. 소비자용
// 하단 탭(BottomTabs)/프로필 완성 가드는 pathname 기준으로 이 경로에서도 스스로
// 숨는다(bottom-tabs.tsx/profile-completion-guard.tsx 수정 참고).
// [HQ 대시보드 스크롤 버그 수정](2026-09-23 사용자 지시): "이거 스크롤 안내려지는데?
// B농장 예약 7건중에 3건만 뜨고 4건은 확인못해" — 원인은 온보딩 화면 스크롤 버그
// (2026-09-22)와 동일하다: 루트 레이아웃(src/app/layout.tsx)의 body가
// `h-dvh overflow-hidden`인데 이 레이아웃은 `min-h-dvh`만 써서 내부에 독립
// 스크롤 컨테이너가 없었다 — 그 body의 고정 높이 안에서 컨텐츠가 넘치면 그냥
// 잘렸다. `flex-1 overflow-y-auto`로 변경(my-page-view.tsx/온보딩 화면과 동일한
// 기존 셸 패턴, 제5장 제4조).
export default function HqLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 overflow-y-auto bg-gray-50">{children}</div>;
}
