'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getParentalBadges } from '@/lib/spaces/parental-badges';
import { formatDistance } from '@/lib/spaces/format';

// 지역별 도감 그리드 카드 (spec/space/space-card.md 준용 - 카테고리 칩, 명칭, 주소, 거리, Parental Checkpoint 뱃지)
export function SpaceGridCard({ item, onSelect }: { item: NearbyItem; onSelect: (item: NearbyItem) => void }) {
  const meta = getCategoryMeta(item.category);
  const badges = getParentalBadges(item);
  // Task 9-1: 반경 무관 탐색(캘린더/카테고리 없이 조회된 항목)은 distance_meters가 -1 sentinel이라
  // 이 경우 거리 자체를 표시하지 않는다(space-card.md "현재 위치에서 1.2km" 형태의 실제 거리만 노출).
  const hasDistance = item.distance_meters >= 0;

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
      </div>
      <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.name}</p>
      <p className="text-xs text-gray-400 line-clamp-1">
        {hasDistance ? `현재 위치에서 ${formatDistance(item.distance_meters)} · ` : ''}
        {item.address || '주소 정보 없음'}
      </p>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((badge) => (
            <span
              key={badge.key}
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                badge.emphasis ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
