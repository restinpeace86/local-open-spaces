'use client';

import { AI_RECOMMEND_CATEGORY_ID, CORE_SPOT_CATEGORIES } from '@/lib/spaces/spot-category-groups';

// [스팟픽 나들이 전용 핵심 중분류 1단 필터 개편](2026-08-29 사용자 지시): 대분류→중분류 2단
// 구조를 철회하고, 나들이 목적에 맞는 핵심 중분류(공원/문화센터·문화의집/박물관/도서관/
// 키즈카페/놀이터)만 1단 가로 칩으로 노출한다. 맨 앞의 "AI 추천" 칩은 다른 칩과 달리
// category_min 필터가 아니라 별도 추천 바텀시트를 여는 액션이라 선택 상태/최대 개수 제한에
// 포함하지 않는다.
export const MAX_SPOT_CATEGORY_MIN_SELECTION = 5;

export function SpotCategoryFilter({
  selectedCategoryIds,
  onToggleCategory,
  onLimitExceeded,
  onSelectAiRecommend,
}: {
  selectedCategoryIds: string[];
  onToggleCategory: (id: string) => void;
  onLimitExceeded: () => void;
  onSelectAiRecommend: () => void;
}) {
  const handleClickCategory = (id: string) => {
    const isSelected = selectedCategoryIds.includes(id);
    if (!isSelected && selectedCategoryIds.length >= MAX_SPOT_CATEGORY_MIN_SELECTION) {
      onLimitExceeded();
      return;
    }
    onToggleCategory(id);
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {CORE_SPOT_CATEGORIES.map((category) => {
        if (category.id === AI_RECOMMEND_CATEGORY_ID) {
          return (
            <button
              key={category.id}
              type="button"
              onClick={onSelectAiRecommend}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 shadow-sm hover:opacity-90 transition-opacity"
            >
              {category.emoji} {category.label}
            </button>
          );
        }

        const isSelected = selectedCategoryIds.includes(category.id);
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => handleClickCategory(category.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {category.emoji} {category.label}
          </button>
        );
      })}
    </div>
  );
}
