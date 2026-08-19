'use client';

import { useEffect, useState } from 'react';

// spec/common/search.md 2.1: 입력 즉시(Debounce 300ms) 검색 결과 필터링
const DEBOUNCE_MS = 300;

export function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (keyword: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== value) onChange(draft);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="relative">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="공간/행사 이름, 키워드 검색"
        className="w-full rounded-full border border-gray-300 bg-white pl-4 pr-9 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {draft && (
        <button
          type="button"
          onClick={() => setDraft('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="검색어 지우기"
        >
          ✕
        </button>
      )}
    </div>
  );
}
