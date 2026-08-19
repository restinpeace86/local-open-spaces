'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDDay } from '@/lib/spaces/d-day';
import { formatDistance } from '@/lib/spaces/format';

// spec/common/responsive.md 2.1/2.2: 데스크톱 좌측 패널 리스트 / 모바일 바텀시트 리스트 공용 컴포넌트
export function ItemListPanel({
  items,
  selectedId,
  onSelect,
}: {
  items: NearbyItem[];
  selectedId: string | null;
  onSelect: (item: NearbyItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        주변에 표시할 공간/행사가 없습니다.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((item) => {
        const meta = getCategoryMeta(item.category);
        const dDay = item.item_type === 'EVENT' ? formatDDay(item.reservation_end_date ?? item.end_date) : null;
        const isSelected = item.id === selectedId;

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                isSelected ? 'bg-blue-50' : ''
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: meta.color }}
                aria-hidden
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-900 truncate">
                  {item.name}
                </span>
                <span className="block text-xs text-gray-500">
                  {meta.label}
                  {item.distance_meters >= 0 && ` · ${formatDistance(item.distance_meters)}`}
                </span>
              </span>
              {dDay && (
                <span className="shrink-0 text-xs font-semibold text-red-600">{dDay}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
