'use client';

import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';

// [대분류/중분류 드릴다운 개편](2026-08-27 사용자 지시): 기존 QuickCategoryGrid(event_type
// 기반 5대 카테고리, 단일 레벨)를 대체하는 신규 컴포넌트 — 7대 대분류(category_maj)를 누르면
// 그 중분류(category_min) 칩 목록이 나타나고, 중분류를 누르면 그 값으로 카드 피드가 조회된다
// (부모 HomeView가 실제 조회를 담당). QuickCategoryGrid 자체는 건드리지 않는다 —
// CATEGORY_IMAGE_SRC 등 export를 /region(스팟픽 카탈로그, 여전히 구 5대 카테고리 체계를 쓰는
// 별개 화면)이 그대로 참조하고 있어 영향받으면 안 된다(제5장 제4조 기존 구조 우선 — 대신
// 새 컴포넌트를 추가해 서로 독립적으로 유지).
//
// [대분류 영역 내 중분류 노출](2026-08-27 후속 지시): 아이콘 그리드 + 선택된 대분류 하나만의
// 중분류를 그리드 맨 아래에 한 줄로 붙이는 1차 구현은 "중분류가 어느 대분류에 속하는지"가
// 시각적으로 불분명했다("각각의 대분류 영역내에서 떠야") — 아코디언 방식으로 바꿔, 각 대분류를
// 자신만의 행(카드)으로 두고 그 대분류를 누르면 정확히 그 행 바로 아래에 자신의 중분류 칩이
// 펼쳐지도록 했다. 다른 대분류를 누르면 이전 대분류는 접히고 새 대분류가 펼쳐진다(한 번에
// 하나만 펼침 — 여러 대분류가 동시에 펼쳐지면 "지금 보고 있는 카드가 어느 대분류 소속인지"
// 다시 헷갈리기 때문).
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
  return (
    <div className="flex flex-col gap-1.5 px-4">
      {CATEGORY_MAJ_OPTIONS.map((opt) => {
        const isActive = selectedMaj === opt.maj;
        return (
          <div
            key={opt.maj}
            className="rounded-xl border overflow-hidden transition-colors"
            style={{ borderColor: isActive ? opt.color : '#e5e7eb' }}
          >
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectMaj(opt.maj)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
                style={{ backgroundColor: isActive ? opt.color : `${opt.color}22` }}
                aria-hidden
              >
                {opt.emoji}
              </span>
              <span className={`flex-1 text-sm ${isActive ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                {opt.maj}
              </span>
              <span className="text-gray-400 text-xs shrink-0" aria-hidden>
                {isActive ? '▲' : '▼'}
              </span>
            </button>

            {isActive && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                {opt.minorCategories.map((min) => {
                  const isMinActive = selectedMin === min;
                  return (
                    <button
                      key={min}
                      type="button"
                      aria-pressed={isMinActive}
                      onClick={() => onSelectMin(min)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        isMinActive
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
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
      })}
    </div>
  );
}
