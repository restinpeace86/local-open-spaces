'use client';

import { useEffect, useState } from 'react';
import { CuratedItemFormModal } from '@/components/admin/curated-item-form-modal';
import { SpotPicker, SpotOption } from '@/components/community/spot-picker';
import {
  mapSearchItemToCuratedItemPrefill,
  MyRealTripCategory,
  MyRealTripProductDetail,
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
// 목적이기 때문이다.
//
// [상품 상세 → 제휴 등록 흐름으로 변경](2026-09-16 후속 지시): "상품리스트 보고..
// 상품 상세 들어가서 해당 상품에 대하여 제휴상품으로 등록하는 흐름으로" — 처음엔
// 카드에서 바로 등록했지만, 등록 전에 상세 설명/포함사항을 확인하고 싶다는
// 요구로 카드 → 상세 모달 → (마이링크 생성) → 등록 폼 순서로 바꿨다.
const DEFAULT_CITY = '서울';
const SORT_LABELS: Record<MyRealTripSort, string> = {
  price_asc: '가격 낮은순',
  price_desc: '가격 높은순',
  review_score_desc: '리뷰 높은순',
  selling_count_desc: '판매량순',
};

// [마이리얼트립 상품 → 우리 스팟 역방향 매칭](2026-09-16 사용자 지시): "몇백개의
// 키즈카페 중에 마이리얼트립에 있는건 46개.. 46개에 대하여 우리쪽 연결하고 그
// 연결한건 안나와서 내가 연결했다는걸 인지할수 있는것.. 소거법으로 가야하지
// 않을까?" — 스팟(수백 개) 각각에서 검색하는 대신, 마이리얼트립 상품(훨씬 적음)
// 목록을 기준으로 각각에 맞는 스팟을 찾아 연결하는 흐름. linkedSpotName이 있으면
// "이미 처리 완료"로 표시해 관리자가 남은 미해결 항목만 훑어볼 수 있게 한다.
function ResultCard({
  item,
  linkedSpotName,
  onOpenDetail,
}: {
  item: MyRealTripSearchItem;
  linkedSpotName: string | undefined;
  onOpenDetail: (item: MyRealTripSearchItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(item)}
      className={`text-left rounded-xl border overflow-hidden flex flex-col ${
        linkedSpotName ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 hover:border-blue-300'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.itemName} className="w-full h-28 object-cover bg-gray-100" />
      <div className="p-2.5 flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-900 line-clamp-2">{item.itemName}</span>
        <span className="text-[11px] text-gray-500">{item.category}</span>
        <span className="text-sm font-bold text-gray-900">{item.priceDisplay}</span>
        {item.reviewCount > 0 && (
          <span className="text-[11px] text-gray-500">
            ⭐ {item.reviewScore.toFixed(1)} ({item.reviewCount.toLocaleString()})
          </span>
        )}
        {linkedSpotName && <span className="text-[11px] font-semibold text-emerald-700">✅ {linkedSpotName}에 연결됨</span>}
      </div>
    </button>
  );
}

// [마이리얼트립 상품 → 우리 스팟 역방향 매칭](2026-09-16 사용자 지시) — 이 상품에
// 해당하는 우리 스팟을 검색해서 골라 연결한다(기존 SpotPicker 재사용, 제5장
// 제4조). 연결 시점에 마이링크를 생성해 함께 저장한다(spot-myrealtrip-link
// POST가 이미 이 일을 한다 — 스팟 상세에서 승인하는 경로와 완전히 동일한
// 엔드포인트, 호출 방향만 반대).
function ConnectToSpotModal({
  item,
  onClose,
  onConnected,
}: {
  item: MyRealTripSearchItem;
  onClose: () => void;
  onConnected: (spotName: string) => void;
}) {
  const [spot, setSpot] = useState<SpotOption | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    if (!spot || isConnecting) return;
    setIsConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/spot-myrealtrip-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot_id: spot.id,
          gid: item.gid,
          item_name: item.itemName,
          image_url: item.imageUrl,
          price_display: item.priceDisplay,
          product_url: item.productUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.link) throw new Error(data.error ?? '연결에 실패했습니다.');
      onConnected(spot.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결에 실패했습니다.');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="w-full md:w-[420px] bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">우리 스팟과 연결</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          "{item.itemName}"에 해당하는 우리 스팟을 검색해서 골라주세요.
        </p>
        <SpotPicker selected={spot} onSelect={setSpot} />
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        <button
          type="button"
          onClick={handleConnect}
          disabled={!spot || isConnecting}
          className="mt-3 w-full rounded-xl bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
        >
          {isConnecting ? '연결 중...' : '이 스팟과 연결 (마이링크 자동 생성)'}
        </button>
      </div>
    </div>
  );
}

// [상품 상세 확인 후 제휴 등록](2026-09-16 후속 지시): detail(gid)로 소개 문구/
// 포함·불포함 사항을 보여주고, "제휴 상품으로 등록"을 누르면 mylink(추적 링크)를
// 먼저 생성한 뒤 그 값으로 CuratedItemFormModal을 연다. mylink 생성이 실패해도
// (제5장 제11조 — 서비스가 멈추면 안 됨) 원본 링크로라도 등록할 수 있는 대안을
// 남겨 둔다 — 다만 그 경우 추적이 안 된다는 점을 명확히 경고한다.
function MyRealTripProductDetailModal({
  item,
  linkedSpotName,
  onClose,
  onSaved,
  onConnectedToSpot,
}: {
  item: MyRealTripSearchItem;
  linkedSpotName: string | undefined;
  onClose: () => void;
  onSaved: () => void;
  onConnectedToSpot: (gid: string, spotName: string) => void;
}) {
  const [detail, setDetail] = useState<MyRealTripProductDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<ReturnType<typeof mapSearchItemToCuratedItemPrefill> | null>(null);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/myrealtrip/detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gid: item.gid }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '상품 상세 조회에 실패했습니다.');
        setDetail(data);
      })
      .catch((err) => setDetailError(err instanceof Error ? err.message : '상품 상세 조회에 실패했습니다.'));
  }, [item.gid]);

  async function handleRegister(bookingUrl: string) {
    setPrefill(mapSearchItemToCuratedItemPrefill(item, bookingUrl));
  }

  async function handleGenerateMylinkAndRegister() {
    if (isGeneratingLink) return;
    setIsGeneratingLink(true);
    setLinkError(null);
    try {
      const res = await fetch('/api/admin/myrealtrip/mylink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: item.productUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.mylink) throw new Error(data.error ?? '마이링크 생성에 실패했습니다.');
      await handleRegister(data.mylink);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : '마이링크 생성에 실패했습니다.');
    } finally {
      setIsGeneratingLink(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[560px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3 gap-3">
          <h2 className="text-sm font-bold text-gray-900">{item.itemName}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={item.itemName} className="w-full h-40 object-cover rounded-lg bg-gray-100 mb-3" />
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className="font-bold text-gray-900">{item.priceDisplay}</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-500">{item.category}</span>
          {item.reviewCount > 0 && <span className="text-gray-500">· ⭐ {item.reviewScore.toFixed(1)} ({item.reviewCount.toLocaleString()})</span>}
        </div>

        {detailError && <p className="text-xs text-red-500">{detailError}</p>}
        {!detailError && !detail && <p className="text-xs text-gray-400">상세 정보를 불러오는 중...</p>}
        {detail && (
          <div className="flex flex-col gap-3 mb-4">
            {(detail.included.length > 0 || detail.excluded.length > 0) && (
              <div className="flex flex-col gap-1 text-xs">
                {detail.included.length > 0 && <p className="text-gray-700">✅ 포함: {detail.included.join(', ')}</p>}
                {detail.excluded.length > 0 && <p className="text-gray-500">❌ 불포함: {detail.excluded.join(', ')}</p>}
              </div>
            )}
            {detail.description && (
              <div
                className="rounded-lg border border-gray-200 p-3 text-sm text-gray-700 max-h-64 overflow-y-auto [&_img]:max-w-full"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: detail.description }}
              />
            )}
          </div>
        )}

        <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="block mb-3 text-xs text-blue-600 underline">
          마이리얼트립에서 원문 보기 ↗
        </a>

        <button
          type="button"
          onClick={handleGenerateMylinkAndRegister}
          disabled={isGeneratingLink}
          className="w-full rounded-xl bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
        >
          {isGeneratingLink ? '마이링크(추적 링크) 생성 중...' : '🔗 제휴 상품으로 등록'}
        </button>
        {linkError && (
          <div className="mt-2 flex flex-col gap-1.5">
            <p className="text-xs text-red-500">{linkError}</p>
            <button
              type="button"
              onClick={() => handleRegister(item.productUrl)}
              className="text-xs font-semibold text-gray-500 underline"
            >
              추적 없이 원본 링크로 등록(수익 정산 안 됨)
            </button>
          </div>
        )}

        {/* [마이리얼트립 상품 → 우리 스팟 역방향 매칭](2026-09-16 사용자 지시):
            "제휴 상품으로 등록"(curated_items — 별도 마케팅 목록)과는 목적이
            다른 별개 기능이다 — 이 상품을 우리가 이미 갖고 있는 "스팟" 하나와
            연결해, 그 스팟 상세 화면에 "구매 둘러보기" 버튼이 뜨게 한다. */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          {linkedSpotName ? (
            <p className="text-xs text-emerald-700 font-semibold">✅ 이미 "{linkedSpotName}" 스팟에 연결돼 있습니다.</p>
          ) : (
            <button
              type="button"
              onClick={() => setIsConnectModalOpen(true)}
              className="w-full rounded-xl border border-gray-300 text-gray-700 text-sm font-medium py-2.5 hover:bg-gray-50"
            >
              🔗 우리 스팟과 연결
            </button>
          )}
        </div>
      </div>

      {prefill && (
        <CuratedItemFormModal
          prefill={prefill}
          onClose={() => setPrefill(null)}
          onSaved={() => {
            setPrefill(null);
            onSaved();
          }}
        />
      )}

      {isConnectModalOpen && (
        <ConnectToSpotModal
          item={item}
          onClose={() => setIsConnectModalOpen(false)}
          onConnected={(spotName) => {
            setIsConnectModalOpen(false);
            onConnectedToSpot(item.gid, spotName);
          }}
        />
      )}
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

  const [detailItem, setDetailItem] = useState<MyRealTripSearchItem | null>(null);
  // [마이리얼트립 상품 → 우리 스팟 역방향 매칭](2026-09-16 사용자 지시): 현재
  // 검색 결과에 표시된 gid들 중 이미 어떤 스팟과 연결된 것을 gid → 스팟명으로
  // 들고 있다("소거법" — 연결된 항목은 카드에 표시만 하고 더 손댈 게 없다).
  const [linkedByGid, setLinkedByGid] = useState<Record<string, string>>({});

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

  // [실측 버그 수정](2026-09-16 사용자 지적: "도시를 서울로 한 상태에서 검색해도
  // 서울하고 무관한 상품들이 많이 나오는데?") — 공식 검색 API(/v1/products/tna/
  // search)에는 애초에 city 파라미터 자체가 없다(categories API에만 있음). 화면의
  // "도시" 입력칸이 검색 요청에 전혀 반영되지 않아, 카테고리로만 걸러진 인천/대전/
  // 심지어 해외(도쿄) 상품까지 섞여 나오는 것을 실측으로 재현 확인했다 — 도시를
  // keyword 앞에 합쳐서 보내야 그 지역 상품 위주로 좁혀진다(완전한 위치 필터는
  // 아니고 어디까지나 텍스트 검색 보정이라, 여전히 약간의 오차는 있을 수 있음을
  // 실측으로 함께 확인했다).
  function buildEffectiveKeyword(): string {
    const trimmedCity = city.trim();
    const trimmedKeyword = keyword.trim();
    if (!trimmedCity) return trimmedKeyword;
    if (!trimmedKeyword) return trimmedCity;
    // 관리자가 키워드에 이미 도시명을 직접 포함해 입력한 경우 중복으로 붙이지 않는다.
    return trimmedKeyword.includes(trimmedCity) ? trimmedKeyword : `${trimmedCity} ${trimmedKeyword}`;
  }

  // [마이리얼트립 상품 → 우리 스팟 역방향 매칭](2026-09-16 사용자 지시): 검색
  // 결과가 새로 나올 때마다 이 gid들 중 이미 연결된 게 있는지 한 번에 확인한다.
  async function fetchLinkedStatus(gids: string[]) {
    if (gids.length === 0) {
      setLinkedByGid({});
      return;
    }
    try {
      const res = await fetch(`/api/admin/spot-myrealtrip-link/by-gids?gids=${gids.map(encodeURIComponent).join(',')}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '연결 상태 조회 실패');
      const map: Record<string, string> = {};
      for (const link of data.links ?? []) map[link.gid] = link.spot_name;
      setLinkedByGid(map);
    } catch {
      // 연결 상태 표시는 보조 정보라 실패해도 검색 결과 자체는 그대로 보여준다
      // (제5장 제11조).
      setLinkedByGid({});
    }
  }

  async function handleSearch(page = 1) {
    const effectiveKeyword = buildEffectiveKeyword();
    if (!effectiveKeyword || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/admin/myrealtrip/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: effectiveKeyword,
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
      const newItems: MyRealTripSearchItem[] = data.items ?? [];
      setItems(newItems);
      setTotalCount(data.totalCount ?? 0);
      fetchLinkedStatus(newItems.map((i) => i.gid));
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
          도시·카테고리·키워드로 자유롭게 탐색하며 아이/가족 대상 상품이 실제로 어느 카테고리에 있는지 확인해 보세요. 카드를 누르면 상세 정보를 보고 제휴 등록까지 이어집니다.
        </p>
        {/* [실측 버그 수정](2026-09-16 사용자 지적): 공식 검색 API에 city 파라미터가
            없어 "도시"가 검색어 앞에 자동으로 합쳐져야만 그 지역 위주로 좁혀진다 —
            텍스트 검색 보정일 뿐 완전한 위치 필터는 아니라는 것을 정직하게 안내한다. */}
        <p className="text-[11px] text-gray-400">
          ℹ️ "도시"는 검색어 앞에 자동으로 합쳐져 함께 검색됩니다(예: 서울 + 키즈 체험 → "서울 키즈 체험"). 완전한 위치 필터는 아니라 무관한 지역 상품이 일부 섞일 수 있습니다.
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
            disabled={isSearching || !buildEffectiveKeyword()}
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
            <p className="text-xs text-gray-400 mb-2">
              총 {totalCount.toLocaleString()}건 중 {items.length}건 표시
              {/* [소거법 진행 상황](2026-09-16 사용자 지시) — 이번 화면에 보이는
                  것 중 이미 연결된 개수를 함께 보여줘 "몇 개 남았는지" 가늠할 수
                  있게 한다. */}
              {Object.keys(linkedByGid).length > 0 && ` (연결됨 ${Object.keys(linkedByGid).length}건)`}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((item) => (
                <ResultCard key={item.gid} item={item} linkedSpotName={linkedByGid[item.gid]} onOpenDetail={setDetailItem} />
              ))}
            </div>
          </>
        )}
      </div>

      {detailItem && (
        <MyRealTripProductDetailModal
          item={detailItem}
          linkedSpotName={linkedByGid[detailItem.gid]}
          onClose={() => setDetailItem(null)}
          onSaved={() => setDetailItem(null)}
          onConnectedToSpot={(gid, spotName) => {
            setLinkedByGid((prev) => ({ ...prev, [gid]: spotName }));
          }}
        />
      )}
    </div>
  );
}
