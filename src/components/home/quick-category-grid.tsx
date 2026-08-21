'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { UI_CATEGORY_FILTER_OPTIONS } from '@/lib/spaces/category-meta';

// Task 9-1-2: 5대 UI 카테고리 대표 이미지(원형 썸네일) — public/images/categories/*.svg
const CATEGORY_IMAGE_SRC: Record<string, string> = {
  EXPERIENCE_CLASS: '/images/categories/experience-class.svg',
  OUTDOOR_NATURE: '/images/categories/outdoor-nature.svg',
  EXHIBITION_MUSEUM: '/images/categories/exhibition-museum.svg',
  PERFORMANCE_FESTIVAL: '/images/categories/performance-festival.svg',
  KIDS_ACTIVITY: '/images/categories/kids-activity.svg',
};

const THUMBNAIL_SIZE = 48;

// docs/spec.md 2.2 ②: "5대 카테고리 Quick 아이콘 그리드: 클릭 시 하단 [🏷️ 카테고리] 탭 연동 및
// 해당 카테고리 즉시 필터링" — /region이 [카테고리] 탭 목적지이므로 category 쿼리파라미터로 넘긴다
// (src/components/region/region-grid-view.tsx가 이 파라미터를 초기 필터값으로 읽도록 Task 9-1에서 연동).
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

export function QuickCategoryGrid() {
  return (
    <div className="grid grid-cols-5 gap-2 px-4">
      {UI_CATEGORY_FILTER_OPTIONS.map((opt) => (
        <Link
          key={opt.category}
          href={`/region?category=${opt.category}`}
          className="flex flex-col items-center gap-1 text-center"
        >
          <CategoryThumbnail category={opt.category} color={opt.color} label={opt.label} />
          <span className="text-[11px] font-medium text-gray-700 line-clamp-1">{opt.label}</span>
        </Link>
      ))}
    </div>
  );
}
