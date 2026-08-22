'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { SpaceGridCard } from '@/components/region/space-grid-card';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { getAllOpenSpaces } from '@/lib/spaces/get-all-spaces';
import { extractDistrict } from '@/lib/spaces/extract-district';
import { UI_CATEGORY_FILTER_OPTIONS } from '@/lib/spaces/category-meta';
import { CATEGORY_IMAGE_SRC } from '@/components/home/quick-category-grid';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { useUserLocation } from '@/hooks/use-user-location';

const ALL_DISTRICT = 'ALL';

// Task 9-1-4: 카테고리 탭 1단계 — 5대 UI 카테고리 선택 화면을 먼저 깔끔하게 보여준다(리스트 없음).
// 홈 Quick 그리드와 같은 이미지 자산을 재사용하되, 여기서는 탭 진입 시의 단독 화면이라 더 크게 보여준다.
function CategoryPickerScreen({ onSelect }: { onSelect: (category: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="text-lg font-bold text-gray-900">카테고리를 선택해주세요</h2>
      <p className="mt-1 text-sm text-gray-500">
        관심 있는 카테고리를 고르면 내 동네 기준으로 장소를 보여드려요.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {UI_CATEGORY_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.category}
            type="button"
            onClick={() => onSelect(opt.category)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white p-5 hover:shadow-md hover:border-gray-300 transition-shadow"
          >
            <span className="relative w-16 h-16 rounded-full overflow-hidden shrink-0">
              <Image
                src={CATEGORY_IMAGE_SRC[opt.category]}
                alt=""
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            </span>
            <span className="text-sm font-semibold text-gray-900">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 지역별 도감 그리드 뷰: 카테고리 탭 2단계 — 자치구/카테고리별로 open_spaces 전체 카탈로그를 탐색한다.
export function RegionGridView() {
  // Task 9-1-4: 헤더에서 설정한 위치(전역 고정, useUserLocation이 LocalStorage로 관리)를
  // 그대로 받아 이 탭에서도 "설정된 위치 기준 데이터 우선 노출"에 사용한다.
  const { center: userLocation, sigunguName } = useUserLocation();
  // Task 9-1(2026-08-22): 홈 화면 5대 카테고리 Quick 그리드에서 "/region?category=KIDS_ACTIVITY"
  // 형태로 넘어온 카테고리를 초기값으로 반영한다 — 이 경우 1단계(선택 화면)를 건너뛰고 바로 2단계로 간다.
  const searchParams = useSearchParams();
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(() => searchParams.get('category') ?? null);
  const [district, setDistrict] = useState(ALL_DISTRICT);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    getAllOpenSpaces(userLocation)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMessage(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // userLocation은 최초 획득 시점 기준으로만 거리순 참조하면 충분하므로 매 변경마다 재조회하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryItems = useMemo(() => {
    if (!category) return [];
    return items.filter((item) => item.category === category);
  }, [items, category]);

  const districtOptions = useMemo(() => {
    const set = new Set(categoryItems.map((item) => extractDistrict(item.address)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [categoryItems]);

  const filteredItems = useMemo(() => {
    let result = categoryItems;
    if (district !== ALL_DISTRICT) {
      result = result.filter((item) => extractDistrict(item.address) === district);
    }

    // Task 9-1-4: 전역 고정 위치(sigunguName) 데이터를 1순위로 정렬한다(제외하지 않음 —
    // 다른 지역만 있어도 빈 화면 대신 그 지역 결과를 보여준다).
    if (sigunguName) {
      result = [...result].sort((a, b) => {
        const aRank = a.sigungu_name === sigunguName ? 0 : 1;
        const bRank = b.sigungu_name === sigunguName ? 0 : 1;
        return aRank - bRank;
      });
    }

    return result;
  }, [categoryItems, district, sigunguName]);

  const resetFilters = () => setDistrict(ALL_DISTRICT);

  const isEmptyByFilter =
    !isLoading && !errorMessage && categoryItems.length > 0 && filteredItems.length === 0;

  // 1단계: 카테고리를 아직 고르지 않았으면 선택 화면만 보여준다.
  if (!category) {
    return <CategoryPickerScreen onSelect={setCategory} />;
  }

  const categoryMeta = UI_CATEGORY_FILTER_OPTIONS.find((opt) => opt.category === category);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← 다른 카테고리
          </button>
          <span className="text-base font-bold text-gray-900">{categoryMeta?.label ?? category}</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="district-select" className="text-sm text-gray-500 shrink-0">
            지역
          </label>
          <select
            id="district-select"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value={ALL_DISTRICT}>전체 지역</option>
            {districtOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {isEmptyByFilter && <EmptyState onReset={resetFilters} />}
        {!isLoading && !errorMessage && !isEmptyByFilter && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredItems.map((item) => (
              <SpaceGridCard key={item.id} item={item} onSelect={setSelectedItem} />
            ))}
          </div>
        )}
      </div>

      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
