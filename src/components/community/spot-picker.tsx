'use client';

import { useEffect, useState } from 'react';

// [Decision 019](2026-09-02): 후기/체크리스트 작성 시 스팟을 고르는 자동완성 입력.
// 기존 스팟픽 서버사이드 검색(/api/spots/search, 2026-08-30 도입)을 그대로 재사용한다
// (제5장 제4조 기존 구조 우선 — 새 검색 엔드포인트를 만들지 않음).
type SpotOption = { id: string; name: string; address: string | null };

const SEARCH_MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;

export function SpotPicker({
  selected,
  onSelect,
}: {
  selected: SpotOption | null;
  onSelect: (spot: SpotOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < SEARCH_MIN_LENGTH) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spots/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!cancelled) setResults(data.items ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="어느 스팟인가요? (장소명 검색)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
      />
      {isSearching && <p className="mt-1 text-xs text-gray-400">검색 중...</p>}
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                // click 대신 mousedown: 입력창 blur로 인해 클릭 직전 목록이 사라지는
                // 문제를 피한다(admin/spot-curations-panel.tsx와 동일한 근거).
                onMouseDown={() => {
                  onSelect({ id: item.id, name: item.name, address: item.address });
                  setQuery('');
                  setResults([]);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <p className="truncate text-gray-800">{item.name}</p>
                {item.address && <p className="truncate text-xs text-gray-400">{item.address}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type { SpotOption };
