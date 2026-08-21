'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDistance } from '@/lib/spaces/format';

// docs/spec.md 2.2 ①: "메인 비주얼 카드 슬라이더 (Hero Carousel)"
// 데이터 조건: 당일 진행 중인 행사/이벤트 중 추천 5~10개 동적 페칭
// UI 카드 내용: 대형 썸네일 + [⚡ 오늘 당일 입장] / [🎁 무료] 뱃지 + 행사명 + 장소/거리
export function HeroCarousel({
  items,
  onSelect,
}: {
  items: NearbyItem[];
  onSelect: (item: NearbyItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory">
      {items.map((item) => {
        const meta = getCategoryMeta(item.category);
        // Task 9-1 발견: events 테이블에 장소명 컬럼이 없어(space_id FK도 전량 미기재 상태,
        // implementation/todo.md 참고) "장소"를 채울 데이터가 없다 — 거리라도 있으면 보여주고,
        // 둘 다 없으면 "장소 정보 없음"으로 정직하게 표시한다(추측 금지).
        const hasDistance = item.distance_meters >= 0;
        const placeText = hasDistance ? `현재 위치에서 ${formatDistance(item.distance_meters)}` : '장소 정보 없음';

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className="shrink-0 w-[78%] sm:w-72 snap-start text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="relative aspect-[4/3] bg-gray-100">
              {item.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-4xl"
                  style={{ backgroundColor: `${meta.color}22` }}
                  aria-hidden
                >
                  🖼️
                </div>
              )}
              <div className="absolute top-2 left-2 flex gap-1">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                  ⚡ 오늘 당일 입장
                </span>
                {item.is_free === true && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                    🎁 무료
                  </span>
                )}
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-gray-900 line-clamp-2">{item.name}</p>
              <p className="text-xs text-gray-400 mt-1 line-clamp-1">{placeText}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
