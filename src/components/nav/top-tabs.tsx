'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBell } from '@/components/notification/notification-bell';

// project/overview.md 탐색 흐름: 지도 탐색 → 지역별 도감 그리드 → 월별 캘린더
// Task 9-1(2026-08-22): 하단 5탭([내주변]/[카테고리] 등) 도입으로 '/'는 신규 홈 화면이 되고,
// 기존 지도/도감/캘린더 3뷰는 (explore) 라우트 그룹(/nearby, /region, /calendar) 안으로 재배치됨
// (Decision 008: "기존 뷰는 폐기가 아니라 새 탭 구조 안으로 재배치"). 이 컴포넌트는 그 3뷰 사이의
// 서브 내비게이션으로 (explore)/layout.tsx에서만 렌더된다(전역 아님).
const TABS = [
  { href: '/nearby', label: '지도' },
  { href: '/region', label: '도감' },
  { href: '/calendar', label: '캘린더' },
];

export function TopTabs() {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 flex items-center justify-between gap-1 border-b border-gray-200 bg-white px-3">
      <div className="flex items-center gap-1">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <NotificationBell />
    </nav>
  );
}
