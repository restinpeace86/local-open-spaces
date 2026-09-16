'use client';

import { useEffect, useState } from 'react';
import { filterSearchItemsByAllKeywordTokens, MyRealTripSearchItem } from '@/lib/admin/myrealtrip-search';

// [스팟 상세 → 마이리얼트립 자동 매칭](2026-09-16 사용자 지시): "스팟픽에서
// 우리의 키즈카페 장소 검색시 해당 장소 눌렀을때 내부적으로 마이리얼트립에서
// 해당 키즈카페 상호명으로 검색하고 있으면.. 동적 버튼을 통하여 티켓 구매
// 둘러보기.. 그거 누를때 바로 넘어가는게 아니고 우리쪽에서 큐레이션 등록하고
// 그 등록한 걸 통해서 넘어가게" — 확인 결과 "관리자 승인 한 번 거치기"로
// 확정(완전 자동은 오매칭/API 분당 한도 초과 위험이 있어 제외). 관리자가 스팟
// 이름으로 검색해 정확한 상품을 골라 승인하면, 그 시점에 마이링크(추적 링크)를
// 한 번만 생성해 저장한다 — 유저 화면은 실시간 검색 없이 이 저장된 결과만 읽는다.
type LinkInfo = { gid: string; item_name: string; image_url: string | null; price_display: string | null; product_url: string; mylink: string };

export function SpotMyRealTripLinkEditor({ spotId, spotName }: { spotId: string; spotName: string }) {
  const [link, setLink] = useState<LinkInfo | null | undefined>(undefined); // undefined = 로딩 전
  const [loadError, setLoadError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState(spotName);
  const [results, setResults] = useState<MyRealTripSearchItem[] | null>(null);
  // [실측 후속 발견](2026-09-16, "법동키즈카페로 검색하면 다나오는데?"): AND
  // 필터가 0건이라 원본 목록으로 폴백한 것인지(정확히 일치하는 상품이 진짜
  // 없는 것) 구분해 안내하기 위한 플래그.
  const [exactMatchFound, setExactMatchFound] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [approvingGid, setApprovingGid] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/spot-myrealtrip-link?spot_id=${encodeURIComponent(spotId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '매칭 조회에 실패했습니다.');
        setLink(data.link ?? null);
      })
      .catch((err) => {
        setLink(null);
        setLoadError(err instanceof Error ? err.message : '매칭 조회에 실패했습니다.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);

  async function handleSearch() {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      // [OR 검색 문제 수정](2026-09-16 사용자 지적): "검색조건이 &가 아니고 OR야"
      // — 마이리얼트립 검색이 토큰 단위 OR라 무관한 동일 업종 결과가 섞여 나온다.
      // 정확한 매칭이 뒤쪽 페이지로 밀릴 수 있어 한 번에 넉넉히(최대 50건)
      // 받아온 뒤, 상호명에 검색어 토큰을 전부 포함하는 것만 우선 필터링한다.
      const res = await fetch('/api/admin/myrealtrip/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmedKeyword, page: 1, size: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '검색에 실패했습니다.');
      const filtered = filterSearchItemsByAllKeywordTokens(data.items ?? [], trimmedKeyword);
      setResults(filtered.items);
      setExactMatchFound(filtered.exactMatchFound);
    } catch (err) {
      setResults([]);
      setExactMatchFound(true);
      setSearchError(err instanceof Error ? err.message : '검색에 실패했습니다.');
    } finally {
      setIsSearching(false);
    }
  }

  async function handleApprove(item: MyRealTripSearchItem) {
    if (approvingGid) return;
    setApprovingGid(item.gid);
    setApproveError(null);
    try {
      const res = await fetch('/api/admin/spot-myrealtrip-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot_id: spotId,
          gid: item.gid,
          item_name: item.itemName,
          image_url: item.imageUrl,
          price_display: item.priceDisplay,
          product_url: item.productUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.link) throw new Error(data.error ?? '매칭 승인에 실패했습니다.');
      setLink(data.link);
      setResults(null);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : '매칭 승인에 실패했습니다.');
    } finally {
      setApprovingGid(null);
    }
  }

  async function handleUnlink() {
    setApproveError(null);
    try {
      const res = await fetch(`/api/admin/spot-myrealtrip-link?spot_id=${encodeURIComponent(spotId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '매칭 해제에 실패했습니다.');
      setLink(null);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : '매칭 해제에 실패했습니다.');
    }
  }

  if (link === undefined) {
    return (
      <div className="mt-3 rounded-xl border border-gray-200 p-3">
        <p className="text-xs text-gray-400">마이리얼트립 매칭 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        🎟️ 마이리얼트립 매칭
        <span className="ml-1.5 text-[10px] font-normal text-gray-400">승인하면 유저 상세 화면에 "티켓 구매 둘러보기" 버튼이 뜹니다</span>
      </h3>
      {loadError && <p className="text-xs text-red-500 mb-1.5">{loadError}</p>}

      {link ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {link.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.image_url} alt={link.item_name} className="w-10 h-10 rounded object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-900 truncate">{link.item_name}</p>
              {link.price_display && <p className="text-[11px] text-emerald-700">{link.price_display}</p>}
            </div>
          </div>
          <button type="button" onClick={handleUnlink} className="shrink-0 text-[11px] font-semibold text-gray-500 underline">
            매칭 해제
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 mb-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={isSearching || !keyword.trim()}
              className="rounded-lg bg-gray-900 text-white text-xs font-semibold px-2.5 py-1.5 disabled:opacity-40"
            >
              {isSearching ? '검색 중...' : '🔍 검색'}
            </button>
          </div>
          {searchError && <p className="text-xs text-red-500 mb-1.5">{searchError}</p>}
          {results && results.length === 0 && !searchError && <p className="text-xs text-gray-400">검색 결과가 없습니다.</p>}
          {/* [실측 후속 발견](2026-09-16, "법동키즈카페로 검색하면 다나오는데?"):
              AND 필터가 0건이라 원본 목록으로 폴백했을 때, 필터가 고장난 것처럼
              보이지 않도록 이유를 명확히 안내한다 — 마이리얼트립 검색 색인에 그
              지역명/상호명이 아예 없어 정확한 매칭을 못 찾은 것일 수 있다. */}
          {results && results.length > 0 && !exactMatchFound && (
            <p className="text-xs text-amber-600 mb-1.5">
              ⚠️ 검색어와 정확히 일치하는 상품을 찾지 못해 전체 검색 결과를 보여드립니다. 이 스팟과 일치하는 상품이 마이리얼트립에 없을 수 있습니다.
            </p>
          )}
          {results && results.length > 0 && (
            <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {results.map((item) => (
                <li key={item.gid} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt={item.itemName} className="w-9 h-9 rounded object-cover shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-900 truncate">{item.itemName}</p>
                      <p className="text-[11px] text-gray-500">{item.priceDisplay}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={approvingGid === item.gid}
                    onClick={() => handleApprove(item)}
                    className="shrink-0 rounded-full bg-blue-600 text-white text-[11px] font-semibold px-2.5 py-1 disabled:opacity-50"
                  >
                    {approvingGid === item.gid ? '승인 중...' : '이 상품으로 승인'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {approveError && <p className="mt-1.5 text-xs text-red-500">{approveError}</p>}
    </div>
  );
}
