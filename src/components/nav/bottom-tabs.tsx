'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FEATURE_FLAGS } from '@/lib/feature-flags';

// docs/spec.md 2.3 / project/overview.md: 하단 5탭 고정 내비게이션.
// [찜]/[마이]는 Decision 003(찜 비노출)·인증 시스템 부재(마이)로 아직 열 수 없어
// spec/common/feature-flags.md 원칙대로 화면은 노출하되 비활성화 처리한다(숨기지 않음 —
// 탭 구조 자체는 항상 5개로 고정돼야 하므로).
const TABS = [
  { href: '/region', label: '카테고리', icon: '🏷️' },
  { href: '/nearby', label: '내주변', icon: '📍' },
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/favorites', label: '찜', icon: '❤️', flag: FEATURE_FLAGS.ENABLE_USER_BOOKMARK },
  { href: '/my', label: '마이', icon: '👤', flag: FEATURE_FLAGS.ENABLE_MY_PAGE },
] as const;

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 grid grid-cols-5 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        const isDisabled = 'flag' in tab && tab.flag === false;

        if (isDisabled) {
          return (
            <div
              key={tab.href}
              aria-disabled="true"
              className="flex flex-col items-center justify-center gap-0.5 py-2 text-gray-300 cursor-not-allowed select-none"
            >
              <span aria-hidden className="text-lg">
                {tab.icon}
              </span>
              <span className="text-[11px] font-medium">{tab.label}</span>
            </div>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span aria-hidden className="text-lg">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
