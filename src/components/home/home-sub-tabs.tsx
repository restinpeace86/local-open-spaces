'use client';

export type HomeSubTab = 'home' | 'hotdeal' | 'free';

const TABS: { key: HomeSubTab; label: string; enabled: boolean }[] = [
  { key: 'home', label: '🏠 홈', enabled: true },
  // 특가·핫딜(쿠팡 파트너스/네이버 쇼핑 등 커머스 API 연동, project/overview.md "신규 확장 목표")은
  // 아직 미착수라 실제 데이터가 전혀 없다 — spec/common/feature-flags.md 원칙대로 탭 자체는
  // 노출하되 클릭 불가(Disabled) 처리한다. 가짜 데이터를 만들어 채우지 않는다(추측 금지).
  { key: 'hotdeal', label: '🏷️ 특가·핫딜', enabled: false },
  { key: 'free', label: '🎁 무료·공공', enabled: true },
];

// docs/spec.md 2.1: 상단 3대 서브 탭 (메인 홈 3rd Tab)
export function HomeSubTabs({
  active,
  onChange,
}: {
  active: HomeSubTab;
  onChange: (tab: HomeSubTab) => void;
}) {
  return (
    <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-gray-100">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        if (!tab.enabled) {
          return (
            <span
              key={tab.key}
              aria-disabled="true"
              title="준비 중입니다"
              className="px-3 py-1.5 text-sm font-medium rounded-full text-gray-300 cursor-not-allowed select-none"
            >
              {tab.label}
            </span>
          );
        }
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              isActive ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
