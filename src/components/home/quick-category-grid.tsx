'use client';

import { useState } from 'react';
import Image from 'next/image';
import { UI_CATEGORY_FILTER_OPTIONS } from '@/lib/spaces/category-meta';

// Task 9-1-2: 5대 UI 카테고리 대표 이미지(원형 썸네일) — public/images/categories/*.svg
// Task 9-1-4: 카테고리 탭 1단계 선택 화면(region-grid-view.tsx)에서도 동일 이미지를 재사용한다.
export const CATEGORY_IMAGE_SRC: Record<string, string> = {
  EXPERIENCE_CLASS: '/images/categories/experience-class.svg',
  OUTDOOR_NATURE: '/images/categories/outdoor-nature.svg',
  EXHIBITION_MUSEUM: '/images/categories/exhibition-museum.svg',
  PERFORMANCE_FESTIVAL: '/images/categories/performance-festival.svg',
  KIDS_ACTIVITY: '/images/categories/kids-activity.svg',
};

const THUMBNAIL_SIZE = 48;

// docs/spec.md 2.2 ②(2026-08-25 개정, Task 9-6-17): "5대 카테고리 Quick 아이콘 그리드: 클릭 시
// 라우팅 이동 없이 이벤트픽 메인 화면 내부에서 해당 카테고리 카드 피드로 즉시 전환(인라인 피딩)"
// — /region으로 라우팅하던 이전 동작을 걷어내고, 선택된 카테고리를 부모(HomeView)에 알려주는
// 콜백으로 바꾼다("테마별 행사" 칩과 동일한 인터랙션 패턴, 제5장 제4조 기존 구조 우선).
//
// Task 9-1-2: 기존 이모지/단색 원 대신 카테고리별 대표 이미지(원형 썸네일)로 교체.
// 이미지 로딩 실패 시(onError) 기존 단색 원 + 카테고리 색상으로 자동 대체한다(레이아웃 깨짐 방지).
function CategoryThumbnail({ category, color, label }: { category: string; color: string; label: string }) {
  const [hasError, setHasError] = useState(false);
  const src = CATEGORY_IMAGE_SRC[category];

  if (!src || hasError) {
    return (
      <span
        className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        ●
      </span>
    );
  }

  return (
    <span className="relative w-12 h-12 rounded-full overflow-hidden shrink-0">
      <Image
        src={src}
        alt={label}
        width={THUMBNAIL_SIZE}
        height={THUMBNAIL_SIZE}
        className="w-full h-full object-cover"
        onError={() => setHasError(true)}
      />
    </span>
  );
}

export function QuickCategoryGrid({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 px-4">
      {UI_CATEGORY_FILTER_OPTIONS.map((opt) => {
        const isActive = selected === opt.category;
        return (
          <button
            key={opt.category}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(opt.category)}
            className="flex flex-col items-center gap-1 text-center"
          >
            <span
              className="rounded-full"
              style={isActive ? { boxShadow: `0 0 0 2px ${opt.color}` } : undefined}
            >
              <CategoryThumbnail category={opt.category} color={opt.color} label={opt.label} />
            </span>
            <span
              className={`text-[11px] line-clamp-1 ${isActive ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
