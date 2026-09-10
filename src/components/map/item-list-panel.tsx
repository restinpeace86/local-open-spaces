'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { formatDDay } from '@/lib/spaces/d-day';
import { formatDistance } from '@/lib/spaces/format';

export type SpotBadgeInfo = { labels: string[]; minAge: number };

// spec/common/responsive.md 2.1/2.2 · implementation/todo.md 개선사항2-3: 스팟픽
// 데스크톱 좌측 패널 리스트 / 모바일 바텀시트 리스트 공용 카드.
//
// [리스트 카드 UI 데이터 표기 스펙](2026-09-10 사용자 지시, 개선사항2-3):
// 한 스팟은 2개 영역.
//  1영역: (1줄) 상호명(좌) + 내 위치로부터의 거리(우) / (2줄) 상세 주소
//  2영역: 해당 스팟 전용 뱃지 목록(카테고리 맞춤형) — 뱃지가 없으면 영역 숨김.
// 구형 레거시 카테고리 라벨(meta.label — '키즈·액티비티' 등)은 노출하지 않는다
// (개선사항2-2·3-2).
export function ItemListPanel({
  items,
  selectedId,
  onSelect,
  badgesBySpotId,
}: {
  items: NearbyItem[];
  selectedId: string | null;
  onSelect: (item: NearbyItem) => void;
  // 스팟별 맞춤형 뱃지(+ "만 x세 이상"). 넘기지 않으면 뱃지 영역을 그리지 않는다.
  badgesBySpotId?: Record<string, SpotBadgeInfo>;
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
        const dDay = item.item_type === 'EVENT' ? formatDDay(item.reservation_end_date ?? item.end_date) : null;
        const isSelected = item.id === selectedId;
        const badgeInfo = badgesBySpotId?.[item.id];
        const badgeChips: string[] = [
          ...(badgeInfo && badgeInfo.minAge > 0 ? [`만 ${badgeInfo.minAge}세 이상`] : []),
          ...(badgeInfo?.labels ?? []),
        ];

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className={`w-full text-left px-4 py-3 flex flex-col gap-1.5 hover:bg-gray-50 transition-colors ${
                isSelected ? 'bg-blue-50' : ''
              }`}
            >
              {/* 1영역 1줄: 상호명(좌) + 거리(우) */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900 truncate">{item.name}</span>
                <span className="shrink-0 flex items-center gap-1.5">
                  {dDay && <span className="text-xs font-semibold text-red-600">{dDay}</span>}
                  {item.distance_meters >= 0 && (
                    <span className="text-xs font-semibold text-blue-600">🧭 {formatDistance(item.distance_meters)}</span>
                  )}
                </span>
              </div>
              {/* 1영역 2줄: 상세 주소 */}
              {item.address && <span className="text-xs text-gray-500 truncate">{item.address}</span>}
              {/* 2영역: 맞춤형 뱃지 — 없으면 렌더링하지 않음 */}
              {badgeChips.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {badgeChips.map((chip, i) => (
                    <span
                      key={chip}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        i === 0 && badgeInfo && badgeInfo.minAge > 0
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
