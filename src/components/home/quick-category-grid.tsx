'use client';

import Link from 'next/link';
import { UI_CATEGORY_FILTER_OPTIONS } from '@/lib/spaces/category-meta';

// docs/spec.md 2.2 ②: "5대 카테고리 Quick 아이콘 그리드: 클릭 시 하단 [🏷️ 카테고리] 탭 연동 및
// 해당 카테고리 즉시 필터링" — /region이 [카테고리] 탭 목적지이므로 category 쿼리파라미터로 넘긴다
// (src/components/region/region-grid-view.tsx가 이 파라미터를 초기 필터값으로 읽도록 Task 9-1에서 연동).
export function QuickCategoryGrid() {
  return (
    <div className="grid grid-cols-5 gap-2 px-4">
      {UI_CATEGORY_FILTER_OPTIONS.map((opt) => (
        <Link
          key={opt.category}
          href={`/region?category=${opt.category}`}
          className="flex flex-col items-center gap-1 text-center"
        >
          <span
            className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg"
            style={{ backgroundColor: opt.color }}
            aria-hidden
          >
            ●
          </span>
          <span className="text-[11px] font-medium text-gray-700 line-clamp-1">{opt.label}</span>
        </Link>
      ))}
    </div>
  );
}
