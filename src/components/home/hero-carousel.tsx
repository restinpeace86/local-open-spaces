'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getParentalBadges } from '@/lib/spaces/parental-badges';
import { formatVenueLine } from '@/lib/spaces/format';

const AUTOPLAY_INTERVAL_MS = 5000;

// docs/spec.md 2.2 ①: "메인 비주얼 카드 슬라이더 (Hero Carousel)"
// 데이터 조건: 당일 진행 중인 행사/이벤트 중 추천 5~10개 동적 페칭
// UI 카드 내용: 대형 썸네일 + [⚡ 오늘 당일 입장] / [🎁 무료] 뱃지 + 행사명 + 장소/거리
// Task 9-1-1: 5초 간격 Auto-play + 터치/호버 시 일시정지.
// Task 9-1-9: 당일 진행 중이 아니라 "이번 주 시작 예정 마감임박"으로 채워진 항목은
// [⚡ 오늘 당일 입장] 대신 [🔥 D-DAY 마감임박] 뱃지로 구분 표시한다.
// Task 9-1-8(2026-08-22 후속): snap-center만으로는 빠르게 스와이프할 때 두 장 이상 건너뛰기도
// 해서, 카드마다 [scroll-snap-stop:always]를 추가해 한 번 드래그에 정확히 1장씩만 멈추게 한다.
function isTodayActive(item: NearbyItem, todayStr: string): boolean {
  return !!item.start_date && !!item.end_date && item.start_date <= todayStr && todayStr <= item.end_date;
}

export function HeroCarousel({
  items,
  onSelect,
  moreHref,
}: {
  items: NearbyItem[];
  onSelect: (item: NearbyItem) => void;
  // Task 9-1-9: 후보가 10개를 넘으면 마지막 슬라이드로 "전체 보기" CTA 카드를 노출한다.
  // 실제 NearbyItem이 아니라 "오늘 전체보기" 전용 화면(/events/today, Task 9-6-6)으로 넘어가는
  // 링크라 별도 prop으로 분리했다. Task 9-6-7: 아래 Floating 버튼도 항목 10개 이하라 CTA 카드가
  // 없을 때의 기본 목적지로 이 값을 재사용한다.
  moreHref?: string;
}) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  // Task 9-6-9(2026-08-23) 버그 수정: 캐러셀이 화면 밖으로 스크롤돼도(하단 "가성비 행복" 섹션
  // 감상 중) Autoplay 타이머가 계속 돌면서 5초마다 itemRefs.current[next]?.scrollIntoView()를
  // 호출해 화면이 강제로 캐러셀 위치까지 튕겨 올라가는 버그가 있었다. IntersectionObserver로
  // 캐러셀 자체가 뷰포트에 조금이라도 보이는지 감시해, 완전히 벗어나면 Autoplay를 멈춘다
  // (호버/터치 일시정지와는 별개 상태로 관리 — 뷰포트 밖에서 마우스가 우연히 올라가 있어도
  // 안전하게 정지 상태를 유지해야 하므로 OR로 합친다).
  const [isInViewport, setIsInViewport] = useState(true);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(([entry]) => setIsInViewport(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [items.length]);

  const isAutoplayPaused = isPaused || !isInViewport;

  useEffect(() => {
    if (items.length <= 1 || isAutoplayPaused) return undefined;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % items.length;
        itemRefs.current[next]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        return next;
      });
    }, AUTOPLAY_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [items.length, isAutoplayPaused]);

  if (items.length === 0) return null;

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    // Task 9-4-2(2026-08-22): Floating 버튼이 가로 스크롤 내용과 무관하게 프레임 우측 하단에
    // 고정되도록, 스크롤되는 슬라이드 컨테이너와 버튼을 감싸는 relative 래퍼를 하나 둔다.
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory">
        {items.map((item, index) => {
        const meta = getCategoryMeta(item.category);
        // Task 9-1-3: "[장소명] · [시/군/구]"로 통일 표시(거리 계산 제거).
        const venueLine = formatVenueLine(item.address, item.sigungu_name);
        const todayActive = isTodayActive(item, todayStr);
        // Task 9-1-4: 4대 핵심 뱃지(가성비/실내외/아이동반/방문시점) 중 가성비·방문시점은 이미
        // 위 썸네일 오버레이(오늘당일·D-DAY / 무료)로 노출되므로, 여기서는 중복 없이 나머지
        // 두 개(실내외·아이동반)만 보완해 4개 전부 빠짐없이 드러나게 한다.
        const supplementBadges = getParentalBadges(item).filter(
          (badge) => badge.key === 'facility_type' || badge.key === 'kids'
        );

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
            className="shrink-0 w-[calc(100vw-32px)] sm:w-72 snap-center [scroll-snap-stop:always] text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="relative aspect-[4/3] bg-gray-100">
              {item.thumbnail_url ? (
                // Task 9-3-1(2026-08-22): 썸네일이 Supabase Storage 외 다양한 공공 API 도메인에서
                // 오기 때문에(next.config.ts remotePatterns가 *.supabase.co만 허용) next/image로
                // 바꾸면 대부분 깨진다 — 기존처럼 <img>를 유지하되, 첫 슬라이드(index===0)만
                // fetchPriority="high"로 즉시 로드하고(next/image의 priority와 동등한 네이티브
                // 속성) 나머지는 loading="lazy"로 모바일 트래픽을 줄인다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnail_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                />
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
                {todayActive ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                    ⚡ 오늘 당일 입장 가능
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">
                    🔥 D-DAY 마감임박
                  </span>
                )}
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
              {supplementBadges.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {supplementBadges.map((badge) => (
                    <span
                      key={badge.key}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        );
      })}

        {moreHref && (
          <Link
            href={moreHref}
            className="shrink-0 w-[calc(100vw-32px)] sm:w-72 snap-center [scroll-snap-stop:always] rounded-2xl border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-2 text-center p-4 hover:bg-gray-100 transition-colors"
          >
            <span className="text-3xl" aria-hidden>
              🗺️
            </span>
            <span className="text-sm font-semibold text-gray-700">오늘 진행 중인 전체 행사 보기</span>
          </Link>
        )}
      </div>

      {/* Task 9-4-2(2026-08-22): 스와이프 상태와 무관하게 항상 노출되는 Floating "오늘 전체보기"
          버튼. 마지막 슬라이드까지 넘겨야만 나오는 위 moreHref CTA 카드(10개 초과 시에만 존재)와
          달리, 이 버튼은 카드 개수와 무관하게 항상 눌러서 당일 전체 행사로 바로 이동할 수 있다.
          Task 9-6-7(2026-08-23) 버그 근본 원인: 이 버튼이 home-view.tsx가 넘기는 moreHref prop과
          완전히 무관하게 자체 href를 하드코딩하고 있었다("/nearby?filter=TODAY_WEEKEND") — Task
          9-6-6에서 moreHref만 /events/today로 고쳤을 때 이 파일을 놓쳐, 카드가 10개 이하라
          moreHref CTA 카드가 아예 없을 때도 항상 보이는 이 Floating 버튼이 여전히 지도로 이동하는
          실제 원인이었다(실측 확인). moreHref가 없을 때(항목 10개 이하)는 기본 목적지
          '/events/today'로 고정한다 — 이 버튼은 원래 카드 개수와 무관하게 항상 노출되어야 하므로
          moreHref 유무에 따라 버튼 자체를 숨기지 않는다. */}
      <Link
        href={moreHref ?? '/events/today'}
        className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-full bg-white/70 backdrop-blur-md border border-white/40 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-md hover:bg-white/90 transition-colors"
      >
        ⚡ 오늘 전체보기 +
      </Link>
    </div>
  );
}
