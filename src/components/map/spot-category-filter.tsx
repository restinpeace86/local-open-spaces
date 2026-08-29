'use client';

import { AI_RECOMMEND_CATEGORY_ID, CORE_SPOT_CATEGORIES } from '@/lib/spaces/spot-category-groups';

// [스팟픽 나들이 전용 핵심 중분류 1단 필터 개편](2026-08-28~29 사용자 지시): 대분류→중분류 2단
// 구조를 철회하고, 나들이 목적에 맞는 핵심 중분류만 1단 가로 칩으로 노출한다. 맨 앞의
// "AI 추천" 칩은 다른 칩과 달리 category_min 필터가 아니라 별도 추천 바텀시트를 여는
// 액션이라 선택 상태에 포함하지 않는다.
//
// [단일 선택으로 변경](2026-08-29 사용자 지시): 기존에는 최대 5개까지 복수 선택 가능했으나,
// 한 번에 하나의 핵심 중분류만 선택 가능한 단일 선택(라디오 버튼 방식)으로 변경한다. 이미
// 선택된 칩을 다시 누르면 선택이 해제되어 전체보기로 돌아간다 — 복수 선택이 아니므로
// "최대 개수 초과" 상황 자체가 존재하지 않아 관련 안내(onLimitExceeded)도 제거했다.
export function SpotCategoryFilter({
  selectedCategoryId,
  onSelectCategory,
  onSelectAiRecommend,
}: {
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  onSelectAiRecommend: () => void;
}) {
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

        const isSelected = selectedCategoryId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelectCategory(category.id)}
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
