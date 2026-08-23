'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EventCard } from '@/components/cards/event-card';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { DEFAULT_REGION_OPTION, REGION_OPTIONS } from '@/lib/geo/region-hierarchy';

// Task 9-6-6(2026-08-23): 홈 화면 "오늘 전체보기+"의 도착 화면. 사용자 피드백에 따라 지도가
// 아니라 카드 그리드로 오늘 진행 중인 행사를 모아 보여준다. 거리(GPS) 기반 정렬/피딩은 쓰지
// 않고, 상단 지역 스위처로 고른 지역 기준 행정구역 계층(구/시 → 도·특별시, 그 외 완전 차단)
// 으로만 피딩한다 — /api/events/today가 이 계층 필터링을 서버에서 수행한다.
export default function TodayEventsPage() {
  const [regionKey, setRegionKey] = useState(DEFAULT_REGION_OPTION.key);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    fetch(`/api/events/today?region=${regionKey}`)
      .then((res) => res.json())
      .then((data: { items?: NearbyItem[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setItems(data.items ?? []);
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
  }, [regionKey]);

  const resetRegion = useCallback(() => setRegionKey(DEFAULT_REGION_OPTION.key), []);

  const isEmpty = !isLoading && !errorMessage && items.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
            ← 홈으로
          </Link>
          <span className="text-base font-bold text-gray-900">🎪 오늘 전체보기</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="region-select" className="text-sm text-gray-500 shrink-0">
            지역
          </label>
          <select
            id="region-select"
            value={regionKey}
            onChange={(e) => setRegionKey(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            {REGION_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {isEmpty && <EmptyState onReset={resetRegion} />}
        {!isLoading && !errorMessage && !isEmpty && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {items.map((item) => (
              <EventCard key={item.id} item={item} onSelect={setSelectedItem} />
            ))}
          </div>
        )}
      </div>

      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
