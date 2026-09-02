'use client';

import { useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { BrandSplash } from '@/components/common/brand-splash';

// Task 9-6-10(2026-08-23): 나드리픽 하단 5대 탭 구조 개편 — [카테고리-내주변-홈-찜-마이]에서
// [추천픽-스팟픽-이벤트픽-찜-마이]로 재정립한다.
//   - 추천픽(/recommend): 카테고리+가격+거리 3조건 DB 필터 + AI TOP3 추천(신규 기능, 아직
//     미구현 — 사용자 지시에 따라 이번 턴은 탭 구조/라벨만 정립하고 화면은 뒤로 미룬다).
//   - 스팟픽(/nearby): 기존 "내주변" 지도 화면 — 이미 상시 공간(open_spaces) 전용으로
//     단일화돼 있다(Task 9-6-10 지도 작업). 라벨만 변경.
//   - 이벤트픽(/): 기존 "홈" 화면 — 라벨만 변경하고 화면 자체를 이벤트(events) 전용으로
//     단일화한다(home-view.tsx의 상시 공간 대분류 토글 제거).
//   - "카테고리"(/region) 탭은 5개 슬롯에서 빠진다 — 화면 자체는 삭제하지 않았고(다른 경로로는
//     여전히 접근 가능), 하단 탭에서만 제외한다.
// [찜]/[마이]는 Decision 003(찜 비노출)·인증 시스템 부재(마이)로 아직 열 수 없어
// spec/common/feature-flags.md 원칙대로 화면은 노출하되 비활성화 처리한다(숨기지 않음 —
// 탭 구조 자체는 항상 5개로 고정돼야 하므로). 추천픽도 같은 원칙으로 비활성화 처리한다.
// [Decision 018](2026-09-02): "마이" 비활성화 사유였던 "인증 시스템 부재"가 카카오/구글
// 소셜 로그인 도입으로 해소돼 NEXT_PUBLIC_ENABLE_MY_PAGE=true로 활성화했다(찜은 이번
// 결정과 무관해 Decision 003 그대로 유지).
const TABS = [
  { href: '/recommend', label: '추천픽', icon: '✨', flag: FEATURE_FLAGS.ENABLE_RECOMMEND_TAB },
  { href: '/nearby', label: '스팟픽', icon: '📍' },
  { href: '/', label: '이벤트픽', icon: '🎪' },
  { href: '/favorites', label: '찜', icon: '❤️', flag: FEATURE_FLAGS.ENABLE_USER_BOOKMARK },
  { href: '/my', label: '마이', icon: '👤', flag: FEATURE_FLAGS.ENABLE_MY_PAGE },
] as const;

export function BottomTabs() {
  const pathname = usePathname();
  const router = useRouter();
  // Task 9-4-1(2026-08-22): 탭 이동은 서버 컴포넌트 데이터 페칭을 동반해 체감상 "먹통"처럼
  // 느껴질 수 있다 — useTransition으로 전환 상태(isPending)를 잡아 즉시 로딩 오버레이를 띄운다.
  const [isPending, startTransition] = useTransition();

  const navigateTo = (href: string) => {
    if (pathname === href) return;
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <>
      {isPending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm"
          aria-label="화면 전환 중"
        >
          <BrandSplash />
        </div>
      )}
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
            <button
              key={tab.href}
              type="button"
              onClick={() => navigateTo(tab.href)}
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
    </>
  );
}
