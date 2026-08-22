'use client';

import { useEffect, useRef, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatVenueLine } from '@/lib/spaces/format';

const AUTOPLAY_INTERVAL_MS = 5000;

// docs/spec.md 2.2 ①: "메인 비주얼 카드 슬라이더 (Hero Carousel)"
// 데이터 조건: 당일 진행 중인 행사/이벤트 중 추천 5~10개 동적 페칭
// UI 카드 내용: 대형 썸네일 + [⚡ 오늘 당일 입장] / [🎁 무료] 뱃지 + 행사명 + 장소/거리
// Task 9-1-1: 5초 간격 Auto-play + 터치/호버 시 일시정지.
export function HeroCarousel({
  items,
  onSelect,
}: {
  items: NearbyItem[];
  onSelect: (item: NearbyItem) => void;
}) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (items.length <= 1 || isPaused) return undefined;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % items.length;
        itemRefs.current[next]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        return next;
      });
    }, AUTOPLAY_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [items.length, isPaused]);

  if (items.length === 0) return null;

  return (
    <div
      className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {items.map((item, index) => {
        const meta = getCategoryMeta(item.category);
        // Task 9-1-3: "[장소명] · [시/군/구]"로 통일 표시(거리 계산 제거).
        const venueLine = formatVenueLine(item.address, item.sigungu_name);

        return (
          // Task 9-1-8: 모바일에서 카드 1장이 화면 좌우 여백(컨테이너 px-4=32px)만큼만 뺀 폭으로
          // 정중앙에 오도록 snap-center로 전환(이전 9-1-3의 snap-start는 좌측 정렬이었다).
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            onClick={() => onSelect(item)}
            className="shrink-0 w-[calc(100vw-32px)] sm:w-72 snap-center text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
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
              {venueLine && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{venueLine}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
