'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';

// 지역별 도감 그리드 카드 (spec/space/space-card.md 준용 - 카테고리 칩, 명칭, 주소, 무료 뱃지)
export function SpaceGridCard({ item, onSelect }: { item: NearbyItem; onSelect: (item: NearbyItem) => void }) {
  const meta = getCategoryMeta(item.category);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="text-left rounded-xl border border-gray-200 bg-white p-3 hover:shadow-md transition-shadow flex flex-col gap-1.5"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: meta.color }}
        >
          {meta.label}
        </span>
        {item.is_free && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
            무료
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.name}</p>
      <p className="text-xs text-gray-400 line-clamp-1">{item.address || '주소 정보 없음'}</p>
    </button>
  );
}
