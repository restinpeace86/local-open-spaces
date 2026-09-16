'use client';

import { useEffect, useState } from 'react';
import { CuratedItemFormModal, CuratedItemFormValue } from '@/components/admin/curated-item-form-modal';
import {
  mapSearchItemToCuratedItemPrefill,
  MyRealTripCategory,
  MyRealTripSearchItem,
  MYREALTRIP_SORT_OPTIONS,
  MyRealTripSort,
} from '@/lib/admin/myrealtrip-search';

// [마이리얼트립 공식 파트너 API 연동](2026-09-16 사용자 지시): "일단 키즈 카테고리
// 뿐만 아니라 가족끼리 갈만한 곳들도 확인해봐야 하는데.. 정말 키즈 카테고리에
// 있는 것만 키즈들 갈만한 곳인지.. 데이터 나오는 걸 보고 축소하든 결정하든 해야
// 할 것 같아 — 일단 관리자용에 구현해보자" — 도시/카테고리/키워드로 자유롭게
// 탐색하며 눈으로 결과를 비교해 볼 수 있는 신규 관리자 탭. 새 탭으로 분리한
// 이유: 기존 "🏷️ 큐레이션/제휴 상품" 탭은 "우리가 이미 등록한 상품 목록 관리"가
// 목적이라 데이터 모양이 다르고(제5장 제4조 — "동일 목적 중복 방지"이지 "다른
// 목적을 억지로 통합"은 아님), 지금 당장은 등록 여부와 무관하게 순수 탐색이
// 목적이기 때문이다. 마음에 드는 결과는 "＋ 큐레이션에 등록" 버튼으로 그 자리에서
// 기존 등록 폼(CuratedItemFormModal)을 그대로 재사용해 저장할 수 있다.
const DEFAULT_CITY = '서울';
const SORT_LABELS: Record<MyRealTripSort, string> = {
  price_asc: '가격 낮은순',
  price_desc: '가격 높은순',
  review_score_desc: '리뷰 높은순',
  selling_count_desc: '판매량순',
};

function ResultCard({ item, onRegister }: { item: MyRealTripSearchItem; onRegister: (item: MyRealTripSearchItem) => void }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.itemName} className="w-full h-28 object-cover bg-gray-100" />
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <span className="text-xs font-semibold text-gray-900 line-clamp-2">{item.itemName}</span>
        <span className="text-[11px] text-gray-500">{item.category}</span>
        <span className="text-sm font-bold text-gray-900">{item.priceDisplay}</span>
        {item.reviewCount > 0 && (
          <span className="text-[11px] text-gray-500">
            ⭐ {item.reviewScore.toFixed(1)} ({item.reviewCount.toLocaleString()})
          </span>
        )}
        <div className="mt-auto flex gap-2 pt-1.5">
          <a
            href={item.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-full py-1 hover:bg-gray-50"
          >
            원문 보기 ↗
          </a>
          <button
            type="button"
            onClick={() => onRegister(item)}
            className="flex-1 text-center text-[11px] font-semibold text-white bg-blue-600 rounded-full py-1 hover:bg-blue-700"
          >
            ＋ 큐레이션에 등록
          </button>
        </div>
      </div>
    </div>
  );
}

export function MyRealTripSearchPanel() {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [categories, setCategories] = useState<MyRealTripCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');

  const [keyword, setKeyword] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState<MyRealTripSort | ''>('');

  const [items, setItems] = useState<MyRealTripSearchItem[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [registerPrefill, setRegisterPrefill] = useState<ReturnType<typeof mapSearchItemToCuratedItemPrefill> | null>(null);

  // 도시가 바뀌면 그 도시의 카테고리 목록을 다시 불러온다(값이 도시마다 다름 —
  // 실측으로 서울/부산/제주 구성이 서로 다름을 확인했다, 절대 하드코딩하지 않음).
  useEffect(() => {
    if (!city.trim()) return;
    setCategoriesError(null);
    fetch('/api/admin/myrealtrip/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: city.trim() }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '카테고리 조회에 실패했습니다.');
        setCategories(data.categories ?? []);
      })
      .catch((err) => {
        setCategories([]);
        setCategoriesError(err instanceof Error ? err.message : '카테고리 조회에 실패했습니다.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  async function handleSearch(page = 1) {
    if (!keyword.trim() || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/admin/myrealtrip/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          category: selectedCategory || undefined,
          minPrice: minPrice ? Number(minPrice) : undefined,
          maxPrice: maxPrice ? Number(maxPrice) : undefined,
          sort: sort || undefined,
          page,
          size: 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '상품 검색에 실패했습니다.');
      setItems(data.items ?? []);
      setTotalCount(data.totalCount ?? 0);
    } catch (err) {
      setItems([]);
      setSearchError(err instanceof Error ? err.message : '상품 검색에 실패했습니다.');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <h2 className="text-sm font-bold text-gray-900">🔍 마이리얼트립 상품 검색 (공식 파트너 API)</h2>
        <p className="text-xs text-gray-500">
          도시·카테고리·키워드로 자유롭게 탐색하며 아이/가족 대상 상품이 실제로 어느 카테고리에 있는지 확인해 보세요.
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-500 shrink-0">도시</span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="예: 서울, 부산, 제주"
            className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-gray-500 shrink-0 ml-2">카테고리</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">(전체)</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value === 'all' ? '' : c.value}>
                {c.name}
              </option>
            ))}
          </select>
          {categoriesError && <span className="text-xs text-red-500">{categoriesError}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
            placeholder="검색 키워드 (예: 서울 키즈 체험)"
            className="flex-1 min-w-[160px] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="최소가"
            className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="최대가"
            className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as MyRealTripSort | '')} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">기본 정렬</option>
            {MYREALTRIP_SORT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleSearch(1)}
            disabled={isSearching || !keyword.trim()}
            className="rounded-lg bg-gray-900 text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-40"
          >
            {isSearching ? '검색 중...' : '검색'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {searchError && <p className="text-sm text-red-500">{searchError}</p>}
        {!searchError && items === null && <p className="text-sm text-gray-400">검색어를 입력하고 검색해 보세요.</p>}
        {!searchError && items !== null && items.length === 0 && <p className="text-sm text-gray-400">검색 결과가 없습니다.</p>}

        {items && items.length > 0 && (
          <>
            <p className="text-xs text-gray-400 mb-2">총 {totalCount.toLocaleString()}건 중 {items.length}건 표시</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((item) => (
                <ResultCard key={item.gid} item={item} onRegister={(i) => setRegisterPrefill(mapSearchItemToCuratedItemPrefill(i))} />
              ))}
            </div>
          </>
        )}
      </div>

      {registerPrefill && (
        <CuratedItemFormModal
          prefill={registerPrefill}
          onClose={() => setRegisterPrefill(null)}
          onSaved={() => setRegisterPrefill(null)}
        />
      )}
    </div>
  );
}
