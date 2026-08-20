'use client';

import { QUICK_FILTER_OPTIONS, QuickFilterKey } from '@/lib/spaces/quick-filters';

// spec/common/search.md 'Quick Filters & Parental Targeting': 다중 선택 가능한 스크리닝 칩
export function QuickFilters({
  value,
  onToggle,
}: {
  value: QuickFilterKey[];
  onToggle: (key: QuickFilterKey) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {QUICK_FILTER_OPTIONS.map((opt) => {
        const isActive = value.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(opt.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              isActive
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
