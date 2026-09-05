'use client';

import { useState } from 'react';
import {
  CORE_SPOT_CATEGORIES,
  SPOT_MAJOR_CATEGORY_OPTIONS,
  SpotMajorCategoryId,
  getSpotCategoriesByMajor,
  isSpotCategoryVisible,
} from '@/lib/spaces/spot-category-groups';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { ItemListPanel } from '@/components/map/item-list-panel';

// [todo.md 개선사항 6](2026-09-03 사용자 지시): "작년 8월 디자인(플랫 단일 탭) 대신, 4대
// 대분류 탭 + 클릭 시 바텀시트로 하위 중분류 노출 구조로 가는 것이 맞다"는 명시적 확인에
// 따라 2026-08-28~29에 철회했던 대분류→중분류 2단 구조를 다시 도입한다. 다만 완전히
// 이전 방식(대분류 클릭 → 화면에 계속 남는 인라인 칩 목록)으로 되돌리지 않고, 이미
// 이벤트픽 홈 화면에서 검증된 `MajorCategoryGrid`와 같은 관례(대분류 클릭 → 슬라이드업
// 바텀시트, 중분류 선택 시 자동으로 닫힘)를 그대로 재사용한다(제5장 제4조 기존 구조
// 우선). "AI 추천"은 대분류가 아니라 별도 추천 액션이라 4개 탭과 분리해 맨 앞에 둔다.
//
// [개선사항5 - 스팟픽 중분류 바텀시트 재구성](2026-09-04 todo.md): "시트 유지 + 내부
// 탭핑 구조" — 중분류를 고르면 시트가 곧바로 닫혀버려 다른 중분류를 이어서 둘러보려면
// 매번 다시 열어야 했고, 대분류를 바꾸려면 이 시트(fixed inset-0, 화면 전체를 덮음)를
// 닫아야만 화면 뒤 대분류 탭을 다시 누를 수 있었다(덮여서 클릭 불가) — 이미 이벤트픽
// MajorCategoryGrid가 검증해 둔 "시트 유지 + 시트 안에 대분류 탭을 다시 두고 결과를
// 그 안에서 갱신" 패턴을 그대로 재사용한다. 다만 이벤트픽과 달리 스팟픽은 배경이
// 지도라 시트가 화면 전체를 덮으면 지도/목록 패널을 볼 수 없다 — 그래서 선택 결과를
// 시트 밖(지도)이 아니라 시트 안에도 함께 보여줘야 "동적 데이터 연동"이 실제로
// 체감된다. 새 데이터 조회 로직을 만들지 않고, 부모(MapExplorer)가 이미 갖고 있는
// 필터링된 items를 그대로 내려받아 기존 ItemListPanel로 그린다(제5장 제4조).
export function SpotCategoryFilter({
  selectedCategoryId,
  onSelectCategory,
  onSelectAiRecommend,
  categoryMinCounts,
  items,
  isItemsLoading = false,
  onSelectItem = () => {},
}: {
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  onSelectAiRecommend: () => void;
  // [개선사항 6] "바텀시트 내에서 나오는 중분류에 대하여 데이터가 0건인 중분류는
  // 중분류항목에서 제외" — 전역 카운트가 아직 안 왔으면(undefined) 전부 노출한다.
  categoryMinCounts?: Record<string, number>;
  // 시트 안에 보여줄, 현재 선택된 중분류 기준으로 이미 필터링된 결과(부모가 소유한
  // 단일 진실 공급원 그대로 재사용 — 지도 마커/리스트 패널과 항상 같은 값).
  items?: NearbyItem[];
  isItemsLoading?: boolean;
  onSelectItem?: (item: NearbyItem) => void;
}) {
  const [openMajorId, setOpenMajorId] = useState<SpotMajorCategoryId | null>(null);

  const selectedCategory = CORE_SPOT_CATEGORIES.find((c) => c.id === selectedCategoryId) ?? null;
  const openMajorOption = SPOT_MAJOR_CATEGORY_OPTIONS.find((opt) => opt.id === openMajorId) ?? null;
  const sheetMinorCategories = openMajorId
    ? getSpotCategoriesByMajor(openMajorId).filter((c) => isSpotCategoryVisible(c, categoryMinCounts))
    : [];

  // 바깥(시트가 닫혀 있을 때 상시 노출)의 대분류 탭은 선택된 중분류가 있으면 그 이름으로
  // 라벨을 바꿔 보여준다(기존 관례 — 닫힌 상태에서도 현재 선택을 한눈에 알 수 있도록).
  function renderMajorChip(major: (typeof SPOT_MAJOR_CATEGORY_OPTIONS)[number]) {
    const isOpen = openMajorId === major.id;
    const isActive = selectedCategory?.major === major.id;
    return (
      <button
        key={major.id}
        type="button"
        aria-pressed={isOpen || isActive}
        onClick={() => setOpenMajorId(major.id)}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
          isOpen || isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        }`}
      >
        <span aria-hidden>{major.emoji}</span> <span>{isActive ? selectedCategory!.label : major.label}</span>
      </button>
    );
  }

  // [개선사항5] 시트 안(열려 있는 동안 계속 보이는) 탭은 라벨을 바꾸지 않고 항상 대분류
  // 고정 이름을 쓴다 — 바로 아래 중분류 칩 목록에 선택된 중분류가 이미 강조돼 있으므로,
  // 탭 라벨까지 같은 이름으로 바뀌면 같은 값이 두 곳에 중복 노출돼 오히려 혼란스럽다.
  function renderInnerMajorTab(major: (typeof SPOT_MAJOR_CATEGORY_OPTIONS)[number]) {
    const isOpen = openMajorId === major.id;
    const hasSelection = selectedCategory?.major === major.id;
    return (
      <button
        key={major.id}
        type="button"
        aria-pressed={isOpen}
        onClick={() => setOpenMajorId(major.id)}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
          isOpen
            ? 'bg-blue-600 text-white border-blue-600'
            : hasSelection
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        }`}
      >
        <span aria-hidden>{major.emoji}</span> <span>{major.label}</span>
      </button>
    );
  }

  return (
    <>
      {/* [개선사항5] 시트가 열려 있으면 내부에도 같은 대분류 탭이 다시 나타나(아래
          renderInnerMajorTab) 같은 라벨이 화면에 중복 등장할 수 있다 — 테스트가 "닫혀
          있을 때 상시 노출되는 바깥 탭"만 정확히 짚어 찾을 수 있도록 testid로 구분한다. */}
      {/* [스팟픽 첫 진입 시 AI 추천 오탭 방지](2026-09-05 사용자 지시): "AI 추천을 2번째나
          3번째로 미루고.. default로 가져오게 하지마 눌렀을때만 가져오게 해" — AI 추천이
          맨 앞(첫 번째)에 있으면 지도 화면에 처음 진입해 이 칩 행을 훑을 때 무의식적으로
          가장 먼저 짚이는 위치라 의도치 않게 눌려 바텀시트가 "자꾸 뜨는" 것처럼 느껴질 수
          있다 — 대분류 탭 2개(키즈/놀이시설, 농장/체험) 뒤, 3번째 자리로 옮겨 우발적 탭을
          줄인다(대분류 4개 사이의 상대 순서 자체는 변경 없음 — 요구사항 원문 순서 유지). */}
      <div data-testid="spot-category-tabs" className="flex gap-1.5 overflow-x-auto pb-0.5">
        {SPOT_MAJOR_CATEGORY_OPTIONS.slice(0, 2).map(renderMajorChip)}
        <button
          type="button"
          onClick={onSelectAiRecommend}
          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 shadow-sm hover:opacity-90 transition-opacity"
        >
          ✨ AI 추천
        </button>
        {SPOT_MAJOR_CATEGORY_OPTIONS.slice(2).map(renderMajorChip)}
      </div>

      {openMajorId && openMajorOption && (
        <div
          data-testid="spot-category-sheet"
          className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
          onClick={() => setOpenMajorId(null)}
        >
          <div
            className="w-full md:w-[480px] max-h-[70vh] md:max-h-[60vh] flex flex-col bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* [개선사항5] 레이아웃/스크롤 안정화: 제목/대분류 탭/중분류 칩은 이 영역에
                고정해두고(sticky가 아니라 아예 스크롤 밖으로 분리 — 부모가 shrink-0,
                형제 데이터 영역만 overflow-y-auto), 그 아래 데이터 목록만 스크롤한다.
                리스트가 아무리 길어져도 이 상단 선택 영역이 밀려나거나 시트 밖으로
                잘리지 않는다. */}
            <div className="shrink-0 border-b border-gray-100">
              <div className="p-4 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  <span aria-hidden>{openMajorOption.emoji}</span> <span>{openMajorOption.label}</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setOpenMajorId(null)}
                  className="shrink-0 text-gray-400 hover:text-gray-600"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

              {/* 대분류 탭 — 시트를 닫지 않고도 바로 옆 대분류로 전환할 수 있도록 시트
                  안에도 동일한 탭을 둔다(바깥 탭 행은 이 시트(fixed inset-0)에 가려져
                  누를 수 없다). */}
              <div className="flex gap-1.5 overflow-x-auto px-4 pb-3">
                {SPOT_MAJOR_CATEGORY_OPTIONS.map(renderInnerMajorTab)}
              </div>

              {sheetMinorCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                  {sheetMinorCategories.map((category) => {
                    const isSelected = selectedCategoryId === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelectCategory(category.id)}
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          isSelected ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span aria-hidden>{category.emoji}</span> <span>{category.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {sheetMinorCategories.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">아직 등록된 데이터가 없어요.</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                {selectedCategory && selectedCategory.major === openMajorId && (
                  <p className="px-4 pt-3 pb-1 text-xs text-gray-400">
                    {isItemsLoading ? '불러오는 중...' : `${items?.length ?? 0}건을 찾았어요`}
                  </p>
                )}
                {selectedCategory && selectedCategory.major === openMajorId ? (
                  <ItemListPanel
                    items={items ?? []}
                    selectedId={null}
                    onSelect={(item) => {
                      onSelectItem(item);
                      setOpenMajorId(null);
                    }}
                  />
                ) : (
                  <p className="p-6 text-center text-sm text-gray-400">중분류를 선택하면 결과가 여기에 나와요.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
