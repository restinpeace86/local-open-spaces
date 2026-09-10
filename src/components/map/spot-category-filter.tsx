'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SPOT_MAJOR_CATEGORY_OPTIONS } from '@/lib/spaces/spot-category-groups';
import { ServiceCategory } from '@/lib/admin/service-category';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { ItemListPanel } from '@/components/map/item-list-panel';

// [노출 중분류 기준 카테고리 필터 전면 교체](2026-09-08 사용자 지시): "현재 노출
// 중분류 기준으로 카테고리 필터 전면교체할것.. 사용자는 스팟픽 진입해서 1. 대분류
// 클릭 -> 하단 바텀시트에 중분류들 노출 2. 중분류 클릭 -> 동일한 바텀시트쪽에
// 거리별 가까운 순서대로.. 보여줌" — 예전엔 category_min(표준 중분류) 기반
// CORE_SPOT_CATEGORIES를 썼지만, 이제 관리자가 직접 큐레이션하는 service_categories
// (노출 중분류)를 단일 출처로 쓴다. "대분류 클릭 → 바텀시트로 중분류 노출 → 중분류
// 클릭 → 같은 시트 안에서 결과 리스트로 전환"이라는 UX 골격 자체는 기존
// (2026-09-03~05, 개선사항5/6)에 이미 검증돼 있던 것을 그대로 재사용한다(제5장
// 제4조) — 데이터 출처만 바꾼다.
//
// 대분류 이름(parent_category, 예: "키즈/놀이시설")은 기존 SPOT_MAJOR_CATEGORY_OPTIONS
// (라벨/이모지/표시 순서)와 실측으로 정확히 일치한다 — service_categories 시드
// 데이터가 애초에 이 4개 대분류 이름을 그대로 썼기 때문이다. 새 이모지 매핑을
// 만들지 않고 라벨 문자열로 매칭해 재사용한다.
export function SpotCategoryFilter({
  serviceCategories,
  serviceCategoryCounts,
  selectedCategoryId,
  onSelectCategory,
  onSelectAiRecommend,
  items,
  badgesBySpotId,
  isItemsLoading = false,
  onSelectItem = () => {},
  sheetRadiusKm,
  onSelectSheetRadiusKm,
}: {
  serviceCategories: ServiceCategory[];
  // [개선사항 6과 동일한 원칙] 데이터가 0건인 중분류는 바텀시트에서 제외한다.
  // 카운트가 아직 안 왔으면(undefined) 전부 노출해 안전하게 폴백한다.
  serviceCategoryCounts?: Record<string, number>;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  onSelectAiRecommend: () => void;
  // 시트 안에 보여줄, 현재 선택된 중분류 + 반경 기준으로 이미 필터링/정렬된 결과
  // (부모가 소유한 단일 진실 공급원 그대로 재사용 — 지도 마커/하단 상시 바텀시트와
  // 항상 같은 값).
  items?: NearbyItem[];
  // [스팟픽 리스트 카드 뱃지](2026-09-10 개선사항2-3): 부모가 배치 조회한
  // 스팟별 맞춤형 뱃지 맵을 그대로 ItemListPanel에 넘긴다.
  badgesBySpotId?: Record<string, { labels: string[]; minAge: number }>;
  isItemsLoading?: boolean;
  onSelectItem?: (item: NearbyItem) => void;
  // [바텀시트 반경 선택](2026-09-08 사용자 지시): "반경 5km 혹은 10km 내 20km
  // 내에 거리순으로 보이도록.. 거리 눌러서 적용할수있게" — 지도(전역 노출)와
  // 무관하게 이 시트의 결과 리스트에만 적용되는 반경. 상태는 부모(map-explorer)가
  // 소유한다(하단 상시 바텀시트와 동일한 반경을 공유해야 하므로).
  sheetRadiusKm: number;
  onSelectSheetRadiusKm: (km: number) => void;
}) {
  const [openMajorLabel, setOpenMajorLabel] = useState<string | null>(null);

  const selectedCategory = serviceCategories.find((c) => c.id === selectedCategoryId) ?? null;
  const openMajorOption = SPOT_MAJOR_CATEGORY_OPTIONS.find((opt) => opt.label === openMajorLabel) ?? null;
  const sheetMinorCategories = openMajorLabel
    ? serviceCategories.filter(
        (c) => c.parent_category === openMajorLabel && (serviceCategoryCounts?.[c.id] ?? 1) > 0
      )
    : [];

  // 바깥(시트가 닫혀 있을 때 상시 노출)의 대분류 탭은 선택된 중분류가 있으면 그
  // 이름으로 라벨을 바꿔 보여준다(기존 관례 — 닫힌 상태에서도 현재 선택을 한눈에
  // 알 수 있도록).
  function renderMajorChip(major: (typeof SPOT_MAJOR_CATEGORY_OPTIONS)[number]) {
    const isOpen = openMajorLabel === major.label;
    const isActive = selectedCategory?.parent_category === major.label;
    return (
      <button
        key={major.id}
        type="button"
        aria-pressed={isOpen || isActive}
        onClick={() => setOpenMajorLabel(major.label)}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
          isOpen || isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        }`}
      >
        <span aria-hidden>{major.emoji}</span> <span>{isActive ? selectedCategory!.category_name : major.label}</span>
      </button>
    );
  }

  // 시트 안(열려 있는 동안 계속 보이는) 탭은 라벨을 바꾸지 않고 항상 대분류 고정
  // 이름을 쓴다 — 바로 아래 중분류 칩 목록에 선택된 중분류가 이미 강조돼 있으므로,
  // 탭 라벨까지 같은 이름으로 바뀌면 같은 값이 두 곳에 중복 노출돼 오히려 혼란스럽다.
  function renderInnerMajorTab(major: (typeof SPOT_MAJOR_CATEGORY_OPTIONS)[number]) {
    const isOpen = openMajorLabel === major.label;
    const hasSelection = selectedCategory?.parent_category === major.label;
    return (
      <button
        key={major.id}
        type="button"
        aria-pressed={isOpen}
        onClick={() => setOpenMajorLabel(major.label)}
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

  const RADIUS_OPTIONS_KM = [5, 10, 20];

  return (
    <>
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

      {/* [대분류 바텀시트가 다른 바텀시트에 가려지는 문제 수정](2026-09-05) 그대로
          createPortal로 document.body 바로 아래에 렌더링한다 — 이유는 아래 원본
          코멘트 참고. */}
      {openMajorLabel &&
        openMajorOption &&
        createPortal(
          <div
            data-testid="spot-category-sheet"
            className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
            onClick={() => setOpenMajorLabel(null)}
          >
          <div
            className="w-full md:w-[480px] max-h-[70vh] md:max-h-[60vh] flex flex-col bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-100">
              <div className="p-4 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  <span aria-hidden>{openMajorOption.emoji}</span> <span>{openMajorOption.label}</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setOpenMajorLabel(null)}
                  className="shrink-0 text-gray-400 hover:text-gray-600"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

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
                        {category.category_name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* [바텀시트 반경 선택](2026-09-08 사용자 지시): 중분류를 선택했을 때만
                  의미가 있다 — 아직 아무것도 안 골랐으면 숨긴다. */}
              {selectedCategory && selectedCategory.parent_category === openMajorLabel && (
                <div className="flex items-center gap-1.5 px-4 pb-3">
                  <span className="text-[11px] text-gray-400">반경</span>
                  {RADIUS_OPTIONS_KM.map((km) => (
                    <button
                      key={km}
                      type="button"
                      aria-pressed={sheetRadiusKm === km}
                      onClick={() => onSelectSheetRadiusKm(km)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                        sheetRadiusKm === km
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {km}km
                    </button>
                  ))}
                </div>
              )}
            </div>

            {sheetMinorCategories.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">아직 등록된 데이터가 없어요.</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                {selectedCategory && selectedCategory.parent_category === openMajorLabel && (
                  <p className="px-4 pt-3 pb-1 text-xs text-gray-400">
                    {isItemsLoading ? '불러오는 중...' : `${items?.length ?? 0}건을 찾았어요`}
                  </p>
                )}
                {selectedCategory && selectedCategory.parent_category === openMajorLabel ? (
                  <ItemListPanel
                    items={items ?? []}
                    badgesBySpotId={badgesBySpotId}
                    selectedId={null}
                    onSelect={(item) => {
                      onSelectItem(item);
                      setOpenMajorLabel(null);
                    }}
                  />
                ) : (
                  <p className="p-6 text-center text-sm text-gray-400">중분류를 선택하면 결과가 여기에 나와요.</p>
                )}
              </div>
            )}
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
