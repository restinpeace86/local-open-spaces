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

// Task 9-1-10(2026-08-22): 5대 UI 카테고리와 동급으로 노출하는 특화 필터.
// "🐶 반려동물 동반"은 실측 확인 결과 DB에 이를 뒷받침할 실제 필드(is_pet_friendly 등)가
// 전혀 없어(open_spaces 컬럼: address/category/facility_type/has_parking/is_free/
// is_kids_friendly/stroller_accessible 등) 임의로 만들어내지 않고 제외했다 — 근거로 삼을 만한
// 유일한 단서(KorPetTourService2 전용 소스 여부)도 2026-08-21 사용자 확인에 따라 contentid
// 기준으로 다른 TourAPI 소스와 source_type/external_id를 통합해 구분이 불가능하다(스킵 로그 참고).
// "♿ 무장애/유모차"는 실제 존재하는 stroller_accessible 컬럼(기존 "🛺 유모차가능" 뱃지와 동일
// 필드, deriveParentalTags의 실측 텍스트 분석으로 채워짐)을 그대로 재사용해 구현했다.
type SpecialFilterKey = 'FREE' | 'ACCESSIBLE';
const SPECIAL_FILTERS: { key: SpecialFilterKey; label: string; emoji: string }[] = [
  { key: 'FREE', label: '완전무료', emoji: '🎁' },
  { key: 'ACCESSIBLE', label: '무장애/유모차', emoji: '♿' },
];

function isSpecialFilterKey(value: string): value is SpecialFilterKey {
  return SPECIAL_FILTERS.some((f) => f.key === value);
}

// Task 9-1-4: 카테고리 탭 1단계 — 5대 UI 카테고리 선택 화면을 먼저 깔끔하게 보여준다(리스트 없음).
// 홈 Quick 그리드와 같은 이미지 자산을 재사용하되, 여기서는 탭 진입 시의 단독 화면이라 더 크게 보여준다.
// Task 9-1-10: 5대 카테고리와 동급으로 "완전무료"/"무장애·유모차" 특화 필터 타일을 추가로 노출한다.
function CategoryPickerScreen({ onSelect }: { onSelect: (selection: string) => void }) {
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
        {SPECIAL_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onSelect(filter.key)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white p-5 hover:shadow-md hover:border-gray-300 transition-shadow"
          >
            <span
              aria-hidden
              className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl shrink-0"
            >
              {filter.emoji}
            </span>
            <span className="text-sm font-semibold text-gray-900">{filter.label}</span>
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
  // Task 9-1-10: 5대 UI 카테고리 값 또는 특화 필터 키('FREE'/'ACCESSIBLE') 중 하나를 담는다.
  const [selection, setSelection] = useState<string | null>(() => searchParams.get('category') ?? null);
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

  // Task 9-1-10: selection이 5대 UI 카테고리 값이면 category로, 'FREE'/'ACCESSIBLE'이면
  // 실제 존재하는 is_free/stroller_accessible 필드로 걸러낸다(카테고리와 동급 취급).
  const selectionItems = useMemo(() => {
    if (!selection) return [];
    if (selection === 'FREE') return items.filter((item) => item.is_free === true);
    if (selection === 'ACCESSIBLE') return items.filter((item) => item.stroller_accessible === true);
    return items.filter((item) => item.category === selection);
  }, [items, selection]);

  const districtOptions = useMemo(() => {
    const set = new Set(selectionItems.map((item) => extractDistrict(item.address)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [selectionItems]);

  const filteredItems = useMemo(() => {
    let result = selectionItems;
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
  }, [selectionItems, district, sigunguName]);

  const resetFilters = () => setDistrict(ALL_DISTRICT);

  const isEmptyByFilter =
    !isLoading && !errorMessage && selectionItems.length > 0 && filteredItems.length === 0;

  // 1단계: 아직 아무 것도 고르지 않았으면 선택 화면만 보여준다.
  if (!selection) {
    return <CategoryPickerScreen onSelect={setSelection} />;
  }

  const categoryMeta = UI_CATEGORY_FILTER_OPTIONS.find((opt) => opt.category === selection);
  const specialFilterMeta = isSpecialFilterKey(selection)
    ? SPECIAL_FILTERS.find((f) => f.key === selection)
    : undefined;
  const selectionLabel = categoryMeta?.label ?? specialFilterMeta?.label ?? selection;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← 다른 카테고리
          </button>
          <span className="text-base font-bold text-gray-900">{selectionLabel}</span>
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
