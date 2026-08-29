'use client';

import { useEffect, useRef, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getParentalBadges } from '@/lib/spaces/parental-badges';
import { getDateBannerBadge } from '@/lib/spaces/event-status';
import { formatVenueLine } from '@/lib/spaces/format';

const AUTOPLAY_INTERVAL_MS = 5000;

// docs/spec.md 2.2 ①: "메인 비주얼 카드 슬라이더 (Hero Carousel)"
// 데이터 조건: 당일 진행 중인 행사/이벤트 중 추천 5~10개 동적 페칭
// Task 9-1-1: 5초 간격 Auto-play + 터치/호버 시 일시정지.
// Task 9-6-13(Decision 012)/9-6-9 후속: getTodayEvents가 이제 end_date=오늘인 행사만 내려주므로
// (9-6-9), 옛 [⚡ 오늘 당일 입장]/[🔥 D-DAY 마감임박] 2분기는 항상 전자만 나오는 죽은 분기가
// 됐다 — event-status.ts의 getDateBannerBadge(다일간 행사가 오늘 끝나는 "오늘 마감" vs 원래
// 하루짜리인 "오늘 한정")로 교체해 EventCard(그리드 카드)와 동일한 배너 기준을 쓴다.
// Task 9-1-8(2026-08-22 후속): snap-center만으로는 빠르게 스와이프할 때 두 장 이상 건너뛰기도
// 해서, 카드마다 [scroll-snap-stop:always]를 추가해 한 번 드래그에 정확히 1장씩만 멈추게 한다.
// [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시): "오늘 전체보기"가 더 이상 별도 페이지로
// 이동하지 않고 홈 화면 위 바텀시트(EventBrowseSheet)로 뜬다 — 페이지 경로 문자열(moreHref)
// 대신 부모(HomeView)가 시트를 여는 콜백(onMoreClick)을 받아 호출한다. CTA 카드 노출 여부는
// 여전히 hasMore(10개 초과)로만 판단한다.

export function HeroCarousel({
  items,
  onSelect,
  hasMore = false,
  onMoreClick = () => {},
}: {
  items: NearbyItem[];
  onSelect: (item: NearbyItem) => void;
  // Task 9-1-9: 후보가 10개를 넘으면 마지막 슬라이드로 "전체 보기" CTA 카드를 노출한다.
  hasMore?: boolean;
  onMoreClick?: () => void;
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
        const dateBanner = getDateBannerBadge(item);
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
            {/* [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시) "메인 배너 크기 다이어트": 기존
                aspect-[4/3](세로에 가까운 큰 카드)를 가로형 배너 비율로 슬림화해, 카드 아래
                섹션들이 첫 화면(Above the fold)에서 바로 보이도록 한다. */}
            <div className="relative aspect-[2/1] bg-gray-100">
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
                {dateBanner && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${
                      dateBanner.kind === 'today_only' ? 'bg-amber-500' : 'bg-rose-600'
                    }`}
                  >
                    {dateBanner.label}
                  </span>
                )}
                {/* [메인 카드 유료/무료 뱃지 누락 수정](2026-08-27 사용자 지시): is_free===true일
                    때만 "무료" 뱃지를 보여주고 is_free===false(유료)면 아무 뱃지도 없어 요금
                    정보를 전혀 알 수 없었다 — EventCard(getParentalBadges)처럼 두 상태 모두
                    표시한다. is_free===null(정보 없음)은 기존처럼 단정 표시하지 않고 숨긴다. */}
                {item.is_free === true && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                    🎁 무료
                  </span>
                )}
                {item.is_free === false && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-700 text-white">
                    💰 유료
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

        {hasMore && (
          <button
            type="button"
            onClick={onMoreClick}
            className="shrink-0 w-[calc(100vw-32px)] sm:w-72 snap-center [scroll-snap-stop:always] rounded-2xl border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-2 text-center p-4 hover:bg-gray-100 transition-colors"
          >
            <span className="text-3xl" aria-hidden>
              🗺️
            </span>
            <span className="text-sm font-semibold text-gray-700">오늘 진행 중인 전체 행사 보기</span>
          </button>
        )}
      </div>

      {/* Task 9-4-2(2026-08-22): 스와이프 상태와 무관하게 항상 노출되는 Floating "오늘 전체보기"
          버튼. 마지막 슬라이드까지 넘겨야만 나오는 위 hasMore CTA 카드(10개 초과 시에만 존재)와
          달리, 이 버튼은 카드 개수와 무관하게 항상 눌러서 바텀시트를 열 수 있다. */}
      <button
        type="button"
        onClick={onMoreClick}
        className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-full bg-white/70 backdrop-blur-md border border-white/40 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-md hover:bg-white/90 transition-colors"
      >
        ⚡ 오늘 전체보기 +
      </button>
    </div>
  );
}
