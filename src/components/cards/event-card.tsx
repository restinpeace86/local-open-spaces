'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getParentalBadges } from '@/lib/spaces/parental-badges';
import { getEventStatus } from '@/lib/spaces/event-status';
import { formatDateRange } from '@/lib/spaces/format';

// spec/event/event-card.md 준용 신규 카드 (Task 9-1) — 기존에는 이벤트 전용 카드가 없었고
// ItemListPanel의 리스트 행으로만 표현됐다. 썸네일/상태 뱃지/예약 마감 경고를 갖춘
// 독립 카드 형태가 필요해 새로 만든다(기존 SpaceGridCard는 공간 전용 필드 구성이라 그대로 못 씀).
export function EventCard({ item, onSelect }: { item: NearbyItem; onSelect: (item: NearbyItem) => void }) {
  const meta = getCategoryMeta(item.category);
  const badges = getParentalBadges(item);
  const status = getEventStatus(item);
  const period = formatDateRange(item.start_date, item.end_date);

  // event-card.md 2: 예약 마감 임박(오늘까지)이면 붉은 경고 뱃지를 최우선 노출
  const showReservationAlert = item.is_reservation_required === true && status.label === '오늘 마감';

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      <div className="relative aspect-[16/9] bg-gray-100">
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: `${meta.color}22` }}
            aria-hidden
          >
            🖼️
          </div>
        )}
        <span
          className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: meta.color }}
        >
          {meta.label}
        </span>
        <span className="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
          {status.label}
        </span>
      </div>

      <div className="p-3 flex flex-col gap-1.5">
        {showReservationAlert && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white self-start">
            🚨 오늘 예약 마감
          </span>
        )}
        <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.name}</p>
        {period && <p className="text-xs text-gray-400 line-clamp-1">{period}</p>}
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
      </div>
    </button>
  );
}
