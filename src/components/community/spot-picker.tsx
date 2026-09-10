'use client';

import { useEffect, useState } from 'react';

// [Decision 019](2026-09-02): 후기/체크리스트 작성 시 스팟을 고르는 자동완성 입력.
// 기존 스팟픽 서버사이드 검색(/api/spots/search, 2026-08-30 도입)을 그대로 재사용한다
// (제5장 제4조 기존 구조 우선 — 새 검색 엔드포인트를 만들지 않음).
//
// [사용자 글쓰기 스팟 검색 최종 플로우](2026-09-10 사용자 지시, implementation/
// todo.md 개선사항5):
//  - 3글자 이상 입력 시 검색, 디바운스 0.3초.
//  - 2단계: 내부 DB 우선 조회 → 결과가 없거나 부족하면(3건 미만) 카카오 로컬 API를
//    Fallback으로 함께 노출(/api/spots/search-external).
//  - 외부(미등록) 장소를 탭하면 /api/spots/upsert-external로 우리 DB에 Auto-Upsert
//    후, 반환된 스팟 id로 선택 완료.
type SpotOption = { id: string; name: string; address: string | null };
type ExternalPlace = { externalId: string; name: string; address: string; lat: number; lng: number };

const SEARCH_MIN_LENGTH = 3;
const DEBOUNCE_MS = 300;
// 내부 결과가 이 수보다 적으면 외부 API도 함께 조회한다("없거나 부족한 경우").
const EXTERNAL_FALLBACK_THRESHOLD = 3;

export function SpotPicker({
  selected,
  onSelect,
}: {
  selected: SpotOption | null;
  onSelect: (spot: SpotOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotOption[]>([]);
  const [externalResults, setExternalResults] = useState<ExternalPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < SEARCH_MIN_LENGTH) {
      setResults([]);
      setExternalResults([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const q = query.trim();
    const timer = setTimeout(async () => {
      try {
        // 1단계: 내부 DB(중분류 무관 전체 대상).
        const res = await fetch(`/api/spots/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const internal: SpotOption[] = data.items ?? [];
        if (cancelled) return;
        setResults(internal);

        // 2단계: 내부 결과가 부족하면 외부(카카오 로컬)도 함께.
        if (internal.length < EXTERNAL_FALLBACK_THRESHOLD) {
          const extRes = await fetch(`/api/spots/search-external?q=${encodeURIComponent(q)}`);
          const extData = await extRes.json();
          if (cancelled) return;
          const internalAddrs = new Set(internal.map((s) => (s.address ?? '').replace(/\s+/g, '')));
          setExternalResults(
            ((extData.items ?? []) as ExternalPlace[]).filter(
              (p) => !internalAddrs.has(p.address.replace(/\s+/g, ''))
            )
          );
        } else {
          setExternalResults([]);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setExternalResults([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function pickInternal(item: SpotOption) {
    onSelect({ id: item.id, name: item.name, address: item.address });
    setQuery('');
    setResults([]);
    setExternalResults([]);
  }

  // [Auto-Upsert] 외부 장소를 우리 DB에 등록하고, 반환된 id로 선택 완료.
  async function pickExternal(place: ExternalPlace) {
    setRegisteringId(place.externalId);
    setRegisterError(null);
    try {
      const res = await fetch('/api/spots/upsert-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(place),
      });
      const data = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error ?? '장소 등록에 실패했습니다.');
      onSelect({ id: data.item.id, name: data.item.name, address: data.item.address });
      setQuery('');
      setResults([]);
      setExternalResults([]);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : '장소 등록에 실패했습니다.');
    } finally {
      setRegisteringId(null);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <span className="truncate text-sm text-gray-800">{selected.name}</span>
        <button type="button" onClick={() => onSelect(null)} className="ml-2 shrink-0 text-xs text-gray-400 hover:text-gray-600">
          변경
        </button>
      </div>
    );
  }

  const hasAnyResult = results.length > 0 || externalResults.length > 0;

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="어느 스팟인가요? (장소명 3글자 이상)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
      />
      {isSearching && <p className="mt-1 text-xs text-gray-400">검색 중...</p>}
      {registerError && <p className="mt-1 text-xs text-red-600">{registerError}</p>}
      {hasAnyResult && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                // click 대신 mousedown: 입력창 blur로 인해 클릭 직전 목록이 사라지는
                // 문제를 피한다(admin/spot-curations-panel.tsx와 동일한 근거).
                onMouseDown={() => pickInternal(item)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <p className="truncate text-gray-800">{item.name}</p>
                {item.address && <p className="truncate text-xs text-gray-400">{item.address}</p>}
              </button>
            </li>
          ))}
          {externalResults.length > 0 && (
            <>
              <li className="border-t border-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-400">
                지도 검색 결과 · 선택하면 자동으로 등록돼요
              </li>
              {externalResults.map((place) => (
                <li key={place.externalId}>
                  <button
                    type="button"
                    disabled={registeringId !== null}
                    onMouseDown={() => pickExternal(place)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    <p className="truncate text-gray-800">
                      📍 {place.name}
                      {registeringId === place.externalId && (
                        <span className="ml-1 text-xs text-gray-400">등록 중...</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-400">{place.address}</p>
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

export type { SpotOption };
