'use client';

import { useState } from 'react';
import { SPOT_CATEGORY_GROUPS } from '@/lib/spaces/spot-category-groups';

// [스팟픽 대분류/중분류 계층적 탐색](2026-08-28): 대분류 탭을 누르면 그 하위 중분류만
// 노출된다(어드민 HierarchicalCategoryMinFilter, 홈 화면 MajorCategoryGrid와 동일한 관례 —
// 대분류 전환은 "보이는 범위"만 바꾸고 선택된 중분류는 유지된다). 중분류는 최대
// MAX_SPOT_CATEGORY_MIN_SELECTION개까지만 선택 가능하다.
export const MAX_SPOT_CATEGORY_MIN_SELECTION = 5;

export function SpotCategoryFilter({
  selectedMinors,
  onToggleMinor,
  onLimitExceeded,
}: {
  selectedMinors: string[];
  onToggleMinor: (minor: string) => void;
  onLimitExceeded: () => void;
}) {
  const [activeMajor, setActiveMajor] = useState<string>(SPOT_CATEGORY_GROUPS[0]?.major ?? '');
  const currentGroup = SPOT_CATEGORY_GROUPS.find((g) => g.major === activeMajor) ?? SPOT_CATEGORY_GROUPS[0];

  const handleToggleMinor = (minor: string) => {
    const isSelected = selectedMinors.includes(minor);
    if (!isSelected && selectedMinors.length >= MAX_SPOT_CATEGORY_MIN_SELECTION) {
      onLimitExceeded();
      return;
    }
    onToggleMinor(minor);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {SPOT_CATEGORY_GROUPS.map((g) => {
          const isActive = g.major === currentGroup?.major;
          const selectedCount = g.minors.filter((m) => selectedMinors.includes(m)).length;
          return (
            <button
              key={g.major}
              type="button"
              onClick={() => setActiveMajor(g.major)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {g.emoji} {g.major}
              {selectedCount > 0 && <span className="ml-1 text-[10px] font-bold">({selectedCount})</span>}
            </button>
          );
        })}
      </div>
      {currentGroup && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {currentGroup.minors.map((minor) => {
            const isSelected = selectedMinors.includes(minor);
            return (
              <button
                key={minor}
                type="button"
                onClick={() => handleToggleMinor(minor)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {minor}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
