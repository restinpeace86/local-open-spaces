'use client';

import { useState } from 'react';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { FeedCard } from '@/components/home/feed-card';
import { FreeFeedSkeleton } from '@/components/home/free-feed-skeleton';

// [대분류/중분류 드릴다운 개편](2026-08-27 사용자 지시): 기존 QuickCategoryGrid(event_type
// 기반 5대 카테고리, 단일 레벨)를 대체하는 신규 컴포넌트 — 7대 대분류(category_maj) 아이콘을
// 누르면 그 아래 중분류(category_min) 칩 목록이 나타나고, 중분류를 누르면 그 값으로 카드
// 피드가 조회된다(부모 HomeView가 실제 조회를 담당). QuickCategoryGrid 자체는 건드리지
// 않는다 — CATEGORY_IMAGE_SRC 등 export를 /region(스팟픽 카탈로그, 여전히 구 5대 카테고리
// 체계를 쓰는 별개 화면)이 그대로 참조하고 있어 영향받으면 안 된다(제5장 제4조 기존 구조
// 우선 — 대신 새 컴포넌트를 추가해 서로 독립적으로 유지).
//
// [아이콘 그리드 방식으로 원복](2026-08-27 후속 지시): 각 대분류 자신의 행 안에서만 중분류가
// 펼쳐지는 아코디언 방식을 한 차례 시도했으나, 대표가 처음(아이콘 그리드 + 선택된 대분류의
// 중분류를 그리드 바로 아래 한 줄로 노출) 방식을 더 선호해 그대로 되돌렸다.
//
// [대분류/중분류 선택 UI 바텀시트 개편](2026-09-01 사용자 지시): 그리드 바로 아래 인라인으로
// 펼쳐지던 중분류 칩 목록을, 대분류를 누르면 화면 아래에서 슬라이드업되는 바텀시트로
// 바꾼다(기존 `EventBrowseSheet`/`AiRecommendSheet`와 동일한 오버레이+시트 패턴으로 통일 —
// 배경 클릭/✕로 닫힘). 중분류를 고르면 onSelectMin 호출 후 시트를 자동으로 닫는다(선택이
// 끝났으니 더 볼 것이 없음). 대분류 자체의 선택 상태(selectedMaj)는 계속 부모(HomeView)가
// 소유하지만, "시트가 열려 있는지"는 이 컴포넌트만의 순수 UI 상태라 로컬로 둔다.
// [todo.md 개선사항 3](2026-09-03): 실측으로 발견한 문제 — 일부 중분류(예: "교양/어학")는
// is_active+가족·아동 대상+진행중 조건을 동시에 만족하는 행이 DB에 구조적으로 0건이라,
// 눌러도 영원히 "조건에 맞는 행사를 찾는 중입니다"에서 멈춰 고장처럼 보였다. categoryCounts
// (전역 카운트, get-home-feed.ts의 getCategoryMinCounts)가 주어지면 0건 중분류는 칩 목록
// 자체에서 제외한다 — 스팟픽 바텀시트에 이미 요구된 "0건 중분류 제외" 원칙과 동일.
// [바텀시트 구조 복구 및 재적용](2026-09-04 사용자 지시): "중분류 누르면 데이터가 바텀시트가
// 아니라 이벤트픽 화면에서 나온다" — 지금까지는 중분류를 고르면 이 시트를 곧바로 닫고
// (아래 handleSelectMin 참고, 이전에는 setIsSheetOpen(false) 호출) 결과 카드는 부모
// (HomeView)가 시트 밖 본문에 렌더링했다. 이제 중분류를 골라도 시트를 닫지 않고, 결과
// 카드도 이 시트 안(칩 목록 바로 아래)에 렌더링한다 — 데이터 조회 자체는 여전히
// HomeView의 useCategoryFeed가 담당하고(제5장 제4조 기존 구조 우선), 그 상태/콜백을
// props로 받아 이 시트 안에 그리기만 한다.
// [무한 스크롤 도입](2026-09-04 사용자 지시): "더보기 버튼 말고 무한 스크롤로" — 시트의
// 스크롤 컨테이너(칩+결과가 함께 있는 영역) 스크롤이 바닥 근처에 닿으면 onLoadMore를
// 호출한다. IntersectionObserver 대신 onScroll 임계값 검사를 쓴 이유: 이 시트는 전체
// 페이지가 아니라 자체 높이(max-h-[70vh])를 가진 모달 안쪽 스크롤이라, 그 안에서만
// 반복적으로 재관찰해야 하는 sentinel 방식보다 스크롤 위치를 직접 재는 쪽이 더 단순하고
// 테스트하기 쉽다(jsdom에서 scrollHeight/clientHeight를 직접 지정해 시뮬레이션 가능).
const LOAD_MORE_SCROLL_THRESHOLD_PX = 150;

export function MajorCategoryGrid({
  selectedMaj,
  onSelectMaj,
  selectedMin,
  onSelectMin,
  categoryCounts,
  // [바텀시트 구조 복구 및 재적용](2026-09-04 사용자 지시): 실제 소비처(HomeView)는 항상
  // 이 값들을 전부 넘기지만, 이 다섯 개를 옵셔널 + 기본값으로 둔다 — 이미 있던
  // major-category-grid.test.tsx의 대분류/중분류 칩 자체를 다루는 테스트들이 결과
  // 피드와 무관하므로 매번 채워 넣게 강제하지 않기 위함(제5장 제4조 기존 구조 우선,
  // 새로 추가한 것은 아래 결과 피드 전용 테스트에서 명시적으로 채운다).
  categoryFeedItems = null,
  isCategoryFeedLoading = false,
  isCategoryFeedLoadingMore = false,
  categoryFeedHasMore = false,
  onLoadMoreCategoryFeed = () => {},
  onSelectResultItem = () => {},
}: {
  selectedMaj: string | null;
  onSelectMaj: (maj: string) => void;
  selectedMin: string | null;
  onSelectMin: (min: string) => void;
  categoryCounts?: Record<string, number>;
  categoryFeedItems?: NearbyItem[] | null;
  isCategoryFeedLoading?: boolean;
  isCategoryFeedLoadingMore?: boolean;
  categoryFeedHasMore?: boolean;
  onLoadMoreCategoryFeed?: () => void;
  onSelectResultItem?: (item: NearbyItem) => void;
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const activeOption = CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === selectedMaj) ?? null;

  function handleSelectMaj(maj: string) {
    onSelectMaj(maj);
    setIsSheetOpen(true);
  }

  function handleSelectMin(min: string) {
    onSelectMin(min);
    // [바텀시트 구조 복구 및 재적용](2026-09-04 사용자 지시): 더 이상 시트를 닫지 않는다 —
    // 결과가 이 시트 안에 나오므로, 사용자가 다른 중분류로 바로 바꿔볼 수 있게 시트를
    // 열어둔 채로 둔다(닫으려면 ✕나 배경 클릭으로 직접 닫는다).
  }

  function handleSheetScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!categoryFeedHasMore || isCategoryFeedLoadingMore || isCategoryFeedLoading) return;
    const el = e.currentTarget;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < LOAD_MORE_SCROLL_THRESHOLD_PX) {
      onLoadMoreCategoryFeed();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* [이벤트픽 대분류 6종으로 축소](2026-09-04 사용자 지시): 대분류가 7개에서 6개로
          줄었는데 큰 화면(sm 이상) 그리드 칸 수가 여전히 7칸으로 남아 있어 마지막 칸이
          빈 채로 어색하게 보였다 — 실제 항목 수(6)에 맞춘다. */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 px-4">
        {CATEGORY_MAJ_OPTIONS.map((opt) => {
          const isActive = selectedMaj === opt.maj;
          return (
            <button
              key={opt.maj}
              type="button"
              aria-pressed={isActive}
              onClick={() => handleSelectMaj(opt.maj)}
              className="flex flex-col items-center gap-1 text-center"
            >
              <span
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{
                  backgroundColor: isActive ? opt.color : `${opt.color}22`,
                  boxShadow: isActive ? `0 0 0 2px ${opt.color}` : undefined,
                }}
                aria-hidden
              >
                {opt.emoji}
              </span>
              <span
                className={`text-[11px] line-clamp-1 ${isActive ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}
              >
                {opt.maj}
              </span>
            </button>
          );
        })}
      </div>

      {isSheetOpen && activeOption && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
          onClick={() => setIsSheetOpen(false)}
        >
          <div
            className="w-full md:w-[480px] max-h-[70vh] md:max-h-[60vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onScroll={handleSheetScroll}
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {activeOption.emoji} {activeOption.maj}
              </h2>
              <button
                type="button"
                onClick={() => setIsSheetOpen(false)}
                className="shrink-0 text-gray-400 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 p-4">
              {activeOption.minorCategories
                .filter((min) => categoryCounts == null || (categoryCounts[min] ?? 1) > 0)
                .map((min) => {
                const isActive = selectedMin === min;
                return (
                  <button
                    key={min}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleSelectMin(min)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {min}
                  </button>
                );
              })}
            </div>

            {/* [바텀시트 구조 복구 및 재적용](2026-09-04 사용자 지시): 중분류 선택 결과를
                시트 밖(이벤트픽 본문)이 아니라 이 시트 안, 칩 목록 바로 아래에 그린다. */}
            {selectedMin !== null && (
              <div className="px-4 pb-4">
                {isCategoryFeedLoading || categoryFeedItems === null ? (
                  <FreeFeedSkeleton />
                ) : categoryFeedItems.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {categoryFeedItems.map((item) => (
                        <FeedCard key={item.id} item={item} onSelect={onSelectResultItem} />
                      ))}
                    </div>
                    {/* [무한 스크롤 도입](2026-09-04 사용자 지시): "더보기" 버튼 대신 스크롤이
                        바닥에 닿으면(handleSheetScroll) 자동으로 다음 페이지를 불러온다 —
                        로딩 중에는 버튼이 아니라 안내 문구만 보여준다. */}
                    {isCategoryFeedLoadingMore && (
                      <p className="mt-3 text-center text-xs text-gray-400">불러오는 중...</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">조건에 맞는 행사를 찾는 중입니다.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
