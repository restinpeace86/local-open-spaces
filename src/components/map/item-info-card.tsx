'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDDay } from '@/lib/spaces/d-day';

// spec/map/kakao-map.md 4.2: 마커 클릭 시 이름/카테고리/D-day를 담은 모바일 최적화 미니 카드
export function ItemInfoCard({ item, onClose }: { item: NearbyItem; onClose: () => void }) {
  const meta = getCategoryMeta(item.category);
  const dDay = item.item_type === 'EVENT' ? formatDDay(item.reservation_end_date ?? item.end_date) : null;

  return (
    <div className="pointer-events-auto rounded-2xl bg-white shadow-lg border border-gray-200 p-4 flex gap-3">
      <div
        className="w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: meta.color }}
          >
            {meta.label}
          </span>
          {dDay && (
            <span className="text-xs font-semibold text-red-600">{dDay}</span>
          )}
        </div>
        <p className="mt-1 font-medium text-gray-900 truncate">{item.name}</p>
        {item.address && <p className="text-sm text-gray-500 truncate">{item.address}</p>}
        <p className="text-xs text-gray-400 mt-1">
          {Math.round(item.distance_meters)}m 거리
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-gray-400 hover:text-gray-600"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  );
}
