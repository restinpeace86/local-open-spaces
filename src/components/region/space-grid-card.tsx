'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getParentalBadges } from '@/lib/spaces/parental-badges';
import { formatVenueLine } from '@/lib/spaces/format';

// 지역별 도감 그리드 카드 (spec/space/space-card.md 준용 - 카테고리 칩, 명칭, 주소, 거리, Parental Checkpoint 뱃지)
export function SpaceGridCard({ item, onSelect }: { item: NearbyItem; onSelect: (item: NearbyItem) => void }) {
  const meta = getCategoryMeta(item.category);
  const badges = getParentalBadges(item);
  // Task 9-1-3: 홈 피드 항목은 sigungu_name으로 "[장소명] · [시/군/구]"(예: "율동공원 · 성남시
  // 분당구")를 보여준다. 지역 도감 페이지(get_nearby RPC 기반)처럼 sigungu_name이 없는 경우엔
  // 기존처럼 실측 거리(distance_meters)로 대체한다(-1 sentinel이면 장소명만).
  const venueLine = formatVenueLine(item.address, item.sigungu_name, item.distance_meters);

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
      {venueLine && <p className="text-xs text-gray-400 line-clamp-1">{venueLine}</p>}
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
