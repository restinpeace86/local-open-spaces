'use client';

import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';

// [대분류/중분류 드릴다운 개편](2026-08-27 사용자 지시): 기존 QuickCategoryGrid(event_type
// 기반 5대 카테고리, 단일 레벨)를 대체하는 신규 컴포넌트 — 7대 대분류(category_maj) 아이콘을
// 누르면 그 아래 중분류(category_min) 칩 목록이 나타나고, 중분류를 누르면 그 값으로 카드
// 피드가 조회된다(부모 HomeView가 실제 조회를 담당). QuickCategoryGrid 자체는 건드리지
// 않는다 — CATEGORY_IMAGE_SRC 등 export를 /region(스팟픽 카탈로그, 여전히 구 5대 카테고리
// 체계를 쓰는 별개 화면)이 그대로 참조하고 있어 영향받으면 안 된다(제5장 제4조 기존 구조
// 우선 — 대신 새 컴포넌트를 추가해 서로 독립적으로 유지).
export function MajorCategoryGrid({
  selectedMaj,
  onSelectMaj,
  selectedMin,
  onSelectMin,
}: {
  selectedMaj: string | null;
  onSelectMaj: (maj: string) => void;
  selectedMin: string | null;
  onSelectMin: (min: string) => void;
}) {
  const activeOption = CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === selectedMaj) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 px-4">
        {CATEGORY_MAJ_OPTIONS.map((opt) => {
          const isActive = selectedMaj === opt.maj;
          return (
            <button
              key={opt.maj}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectMaj(opt.maj)}
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

      {activeOption && (
        <div className="flex flex-wrap gap-1.5 px-4">
          {activeOption.minorCategories.map((min) => {
            const isActive = selectedMin === min;
            return (
              <button
                key={min}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectMin(min)}
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
      )}
    </div>
  );
}
