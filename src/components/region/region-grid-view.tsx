'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CategoryFilter, ALL_CATEGORY } from '@/components/map/category-filter';
import { SpaceGridCard } from '@/components/region/space-grid-card';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { getAllOpenSpaces } from '@/lib/spaces/get-all-spaces';
import { extractDistrict } from '@/lib/spaces/extract-district';
import { SPACE_CATEGORY_FILTER_OPTIONS } from '@/lib/spaces/category-meta';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { useUserLocation } from '@/hooks/use-user-location';

const ALL_DISTRICT = 'ALL';

// 지역별 도감 그리드 뷰: 자치구/카테고리별로 open_spaces 전체 카탈로그를 탐색한다.
export function RegionGridView() {
  const { center: userLocation } = useUserLocation();
  // Task 9-1(2026-08-22): 홈 화면 5대 카테고리 Quick 그리드에서 "/region?category=KIDS_ACTIVITY"
  // 형태로 넘어온 카테고리를 초기 필터값으로 반영한다(docs/spec.md 2.2 "클릭 시... 즉시 필터링").
  const searchParams = useSearchParams();
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [category, setCategory] = useState(() => searchParams.get('category') ?? ALL_CATEGORY);
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

  const districtOptions = useMemo(() => {
    const set = new Set(items.map((item) => extractDistrict(item.address)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (category !== ALL_CATEGORY) {
      result = result.filter((item) => item.category === category);
    }
    if (district !== ALL_DISTRICT) {
      result = result.filter((item) => extractDistrict(item.address) === district);
    }
    return result;
  }, [items, category, district]);

  const resetFilters = () => {
    setCategory(ALL_CATEGORY);
    setDistrict(ALL_DISTRICT);
  };

  const isEmptyByFilter = !isLoading && !errorMessage && items.length > 0 && filteredItems.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
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
        <CategoryFilter value={category} onChange={setCategory} options={SPACE_CATEGORY_FILTER_OPTIONS} />
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
