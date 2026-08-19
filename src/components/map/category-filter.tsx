'use client';

import { CATEGORY_FILTER_OPTIONS } from '@/lib/spaces/category-meta';

export const ALL_CATEGORY = 'ALL';

// spec/common/search.md 2.3: 카테고리/유형 필터 칩 - 선택 시 지도 마커와 리스트가 즉시 동기화
// options를 지정하면 표시할 카테고리를 제한할 수 있다 (예: 도감 뷰는 공간 카테고리만 노출)
export function CategoryFilter({
  value,
  onChange,
  options = CATEGORY_FILTER_OPTIONS,
}: {
  value: string;
  onChange: (category: string) => void;
  options?: typeof CATEGORY_FILTER_OPTIONS;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      <button
        type="button"
        onClick={() => onChange(ALL_CATEGORY)}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          value === ALL_CATEGORY
            ? 'bg-gray-900 text-white'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
        }`}
      >
        전체
      </button>
      {options.map((opt) => {
        const isActive = value === opt.category;
        return (
          <button
            key={opt.category}
            type="button"
            onClick={() => onChange(opt.category)}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors"
            style={
              isActive
                ? { backgroundColor: opt.color, borderColor: opt.color, color: 'white' }
                : { borderColor: '#d1d5db', color: '#374151', backgroundColor: 'white' }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
