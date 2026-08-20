'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBell } from '@/components/notification/notification-bell';

// project/overview.md 탐색 흐름: 지도 탐색 → 지역별 도감 그리드 → 월별 캘린더
const TABS = [
  { href: '/', label: '지도' },
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
