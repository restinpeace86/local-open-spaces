'use client';

import { usePathname, useRouter } from 'next/navigation';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "모바일 환경 최적화를 위해 하단에 고정 탭바 배치". 기존 소비자용 하단 탭
// (src/components/nav/bottom-tabs.tsx)과 같은 시각 관례(고정 grid, safe-area
// 패딩)를 따르되, 파트너 전용 탭/경로라 완전히 별도 컴포넌트로 둔다(제5장 제4조
// 기존 구조 우선의 취지는 "동일 목적 중복 방지"이지 서로 다른 사용자층·경로를
// 강제로 통합하는 게 아니다).
// [탭 4개 → 3개로 축소](2026-09-23 사용자 지시): "일간/주간/월간/설정 이렇게
// 4개인데 일간/월간/설정 이렇게 3개로 줄여줘 그리고 월간쪽을 주간과 같이해줘
// 한달치에 대하여... 주간처럼" — 독립 탭이었던 주간 뷰를 월간 뷰 안으로
// 흡수했다(월간 페이지가 모바일에서는 주간과 동일한 일자별 리스트 형태를
// 한 달 전체로 확장해 보여준다, /partner/(tabs)/monthly/page.tsx 참고).
const TABS = [
  { href: '/partner/today', label: '오늘', icon: '⏰' },
  { href: '/partner/monthly', label: '월간', icon: '📊' },
  { href: '/partner/more', label: '더보기', icon: '⚙️' },
] as const;

export function PartnerBottomTabs() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="shrink-0 grid grid-cols-3 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const isActive = pathname?.startsWith(tab.href);
        return (
          <button
            key={tab.href}
            type="button"
            onClick={() => router.push(tab.href)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span aria-hidden className="text-lg">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
