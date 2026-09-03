'use client';

import { useState } from 'react';
import {
  CORE_SPOT_CATEGORIES,
  SPOT_MAJOR_CATEGORY_OPTIONS,
  SpotMajorCategoryId,
  getSpotCategoriesByMajor,
  isSpotCategoryVisible,
} from '@/lib/spaces/spot-category-groups';

// [todo.md 개선사항 6](2026-09-03 사용자 지시): "작년 8월 디자인(플랫 단일 탭) 대신, 4대
// 대분류 탭 + 클릭 시 바텀시트로 하위 중분류 노출 구조로 가는 것이 맞다"는 명시적 확인에
// 따라 2026-08-28~29에 철회했던 대분류→중분류 2단 구조를 다시 도입한다. 다만 완전히
// 이전 방식(대분류 클릭 → 화면에 계속 남는 인라인 칩 목록)으로 되돌리지 않고, 이미
// 이벤트픽 홈 화면에서 검증된 `MajorCategoryGrid`와 같은 관례(대분류 클릭 → 슬라이드업
// 바텀시트, 중분류 선택 시 자동으로 닫힘)를 그대로 재사용한다(제5장 제4조 기존 구조
// 우선). "AI 추천"은 대분류가 아니라 별도 추천 액션이라 4개 탭과 분리해 맨 앞에 둔다.
export function SpotCategoryFilter({
  selectedCategoryId,
  onSelectCategory,
  onSelectAiRecommend,
  categoryMinCounts,
}: {
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  onSelectAiRecommend: () => void;
  // [개선사항 6] "바텀시트 내에서 나오는 중분류에 대하여 데이터가 0건인 중분류는
  // 중분류항목에서 제외" — 전역 카운트가 아직 안 왔으면(undefined) 전부 노출한다.
  categoryMinCounts?: Record<string, number>;
}) {
  const [openMajorId, setOpenMajorId] = useState<SpotMajorCategoryId | null>(null);

  const selectedCategory = CORE_SPOT_CATEGORIES.find((c) => c.id === selectedCategoryId) ?? null;
  const openMajorOption = SPOT_MAJOR_CATEGORY_OPTIONS.find((opt) => opt.id === openMajorId) ?? null;
  const sheetMinorCategories = openMajorId
    ? getSpotCategoriesByMajor(openMajorId).filter((c) => isSpotCategoryVisible(c, categoryMinCounts))
    : [];

  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={onSelectAiRecommend}
          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 shadow-sm hover:opacity-90 transition-opacity"
        >
          ✨ AI 추천
        </button>

        {SPOT_MAJOR_CATEGORY_OPTIONS.map((major) => {
          const isActive = selectedCategory?.major === major.id;
          return (
            <button
              key={major.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setOpenMajorId(major.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span aria-hidden>{major.emoji}</span> <span>{isActive ? selectedCategory!.label : major.label}</span>
            </button>
          );
        })}
      </div>

      {openMajorId && openMajorOption && (
        <div
          data-testid="spot-category-sheet"
          className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
          onClick={() => setOpenMajorId(null)}
        >
          <div
            className="w-full md:w-[480px] max-h-[70vh] md:max-h-[60vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
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

            {sheetMinorCategories.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">아직 등록된 데이터가 없어요.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-4">
                {sheetMinorCategories.map((category) => {
                  const isSelected = selectedCategoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        onSelectCategory(category.id);
                        setOpenMajorId(null);
                      }}
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
        </div>
      )}
    </>
  );
}
