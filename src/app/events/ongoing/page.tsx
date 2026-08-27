'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EventCard } from '@/components/cards/event-card';
import { EmptyState } from '@/components/map/empty-state';
import { DetailModal } from '@/components/map/detail-modal';
import { Pagination } from '@/components/admin/pagination';
import { NearbyItem } from '@/lib/spaces/get-nearby';

const PAGE_SIZE = 24;

// [전체보기 페이지](2026-08-27 사용자 지시): "현재 이용 가능" 홈 미리보기가 최대 20건만
// 보여주고 끝나는 게 이상하다는 지적 — Hero Carousel의 "오늘 전체보기"(/events/today)와
// 동일한 패턴으로, 실제 DB 페이지네이션을 갖춘 전용 화면을 둔다.
export default function OngoingEventsPage() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    fetch(`/api/events/ongoing?page=${page}&page_size=${PAGE_SIZE}`)
      .then((res) => res.json())
      .then((data: { items?: NearbyItem[]; total?: number; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
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
  }, [page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const isEmpty = !isLoading && !errorMessage && items.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
          ← 홈으로
        </Link>
        <span className="text-base font-bold text-gray-900">✅ 현재 이용 가능 전체보기</span>
        <span className="text-xs text-gray-400">{total.toLocaleString('ko-KR')}건</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {isEmpty && <EmptyState onReset={() => setPage(1)} />}
        {!isLoading && !errorMessage && !isEmpty && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {items.map((item) => (
              <EventCard key={item.id} item={item} onSelect={setSelectedItem} />
            ))}
          </div>
        )}
      </div>

      {!isLoading && !errorMessage && !isEmpty && (
        <div className="shrink-0 flex items-center justify-center p-3 border-t border-gray-100">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
