'use client';

import { useEffect, useState } from 'react';
import { EventTicketCard, EventTicket } from '@/components/cards/event-ticket-card';

const PAGE_SIZE = 24;

// [홈 화면 할인 티켓(event_tickets) 섹션 UI 개편](2026-08-29 사용자 지시) 요구사항 1:
// "전체보기 ›" 클릭 시 뜨는 전체 리스트. 기존 EventBrowseSheet(이벤트픽 이벤트 전체보기)와
// 동일한 바텀시트 관례(배경 클릭/X로 닫힘, 더 보기 페이지네이션)를 따르되, event_tickets는
// category_maj 같은 표준 대분류 체계가 없어 필터 칩은 두지 않는다(제7장 제4조 미래 기능
// 임의 구현 금지 — 이번 지시서에 없는 필터 UI를 임의로 추가하지 않음). 홈 섹션은 스포트라이트용
// Hero 배너 카드(EventTicketBannerCard)를 쓰지만, 여기서는 한 화면에 더 많이 보여주는 게
// 중요해 기존 그리드형 EventTicketCard를 그대로 재사용한다.
export function EventTicketBrowseSheet({
  onClose,
  onSelectEventTicket,
}: {
  onClose: () => void;
  onSelectEventTicket: (eventTicket: EventTicket) => void;
}) {
  const [items, setItems] = useState<EventTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/event-tickets?page=1&page_size=${PAGE_SIZE}`)
      .then((res) => res.json())
      .then((data: { eventTickets?: EventTicket[]; total?: number; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setItems(data.eventTickets ?? []);
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
  }, []);

  function loadMore() {
    const nextPage = page + 1;
    setIsLoading(true);
    fetch(`/api/event-tickets?page=${nextPage}&page_size=${PAGE_SIZE}`)
      .then((res) => res.json())
      .then((data: { eventTickets?: EventTicket[]; total?: number; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setItems((prev) => [...prev, ...(data.eventTickets ?? [])]);
        setTotal((prevTotal) => data.total ?? prevTotal);
        setPage(nextPage);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setIsLoading(false));
  }

  const isEmpty = !isLoading && !errorMessage && items.length === 0;
  const hasMore = items.length < total;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[640px] max-h-[85vh] md:max-h-[75vh] flex flex-col bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">🔥 이번 주말 놓치면 후회할 특가 전체보기</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && items.length === 0 && <p className="text-sm text-gray-400">불러오는 중...</p>}
          {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
          {isEmpty && <p className="text-sm text-gray-400 text-center py-8">할인 티켓/이벤트가 없습니다.</p>}
          {items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((eventTicket) => (
                <EventTicketCard key={eventTicket.id} eventTicket={eventTicket} onSelect={onSelectEventTicket} />
              ))}
            </div>
          )}
          {hasMore && (
            <div className="flex justify-center mt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoading}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isLoading ? '불러오는 중...' : '더 보기'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
