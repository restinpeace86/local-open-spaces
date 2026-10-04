'use client';

import { useState } from 'react';

// [지점별 다중선택 필터](2026-10-04 사용자 지시): "지점별로도 보는거 가능하게
// 좀 필터조건 추가해줘.. 전체도 다볼수 있지만 지점별(복수선택 가능)으로도
// 볼수있는 조건 추가" — 이마트/롯데마트 컬처클럽 관리자 패널 둘 다 지점이
// 60개 이상이라 체크박스 목록을 그냥 펼쳐두면 화면을 너무 많이 차지한다.
// 버튼을 누르면 펼쳐지는 검색 가능한 체크박스 드롭다운으로 공통 구현해
// 두 패널이 공유한다(제5장 제4조 기존 구조 우선 — 거의 동일한 UI를 두 번
// 베껴 쓰지 않음). 지점 목록 자체는 각 패널이 이미 존재하는 공개 API
// (/api/culture-club/stores, /api/culture-club/lottemart-stores)에서 받아와
// prop으로 넘긴다 — 이 컴포넌트는 선택 UI만 담당한다.
export type StoreOption = { storeCode: string; label: string };

export function StoreMultiSelect({
  stores,
  selected,
  onChange,
}: {
  stores: StoreOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredStores = search.trim() ? stores.filter((s) => s.label.includes(search.trim())) : stores;

  function toggleStore(storeCode: string) {
    const next = new Set(selected);
    if (next.has(storeCode)) next.delete(storeCode);
    else next.add(storeCode);
    onChange(next);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-lg border border-gray-300 text-xs px-2 py-1.5 whitespace-nowrap"
      >
        {selected.size === 0 ? '전체 지점' : `지점 ${selected.size}개 선택`} ▾
      </button>

      {isOpen && (
        <>
          {/* 바깥 클릭으로 닫기 — 별도 라이브러리 없이 전체 화면 투명 오버레이로 처리. */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute z-20 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="지점명 검색"
              className="w-full rounded border border-gray-200 text-xs px-2 py-1 mb-2"
            />
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="w-full text-left text-xs text-gray-400 hover:text-gray-600 mb-1 px-1"
              >
                ↻ 선택 초기화
              </button>
            )}
            {filteredStores.map((store) => (
              <label key={store.storeCode} className="flex items-center gap-2 text-xs px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" checked={selected.has(store.storeCode)} onChange={() => toggleStore(store.storeCode)} />
                {store.label}
              </label>
            ))}
            {filteredStores.length === 0 && <p className="text-xs text-gray-400 px-1 py-2">검색 결과가 없습니다.</p>}
          </div>
        </>
      )}
    </div>
  );
}
