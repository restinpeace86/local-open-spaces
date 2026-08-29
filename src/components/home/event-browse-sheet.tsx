'use client';

import { useCallback, useEffect, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { EventCard } from '@/components/cards/event-card';
import { EmptyState } from '@/components/map/empty-state';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';
import { DEFAULT_REGION_OPTION, REGION_OPTIONS } from '@/lib/geo/region-hierarchy';

export type EventBrowseSheetMode = 'today' | 'ongoing' | 'reservation-open';

const PAGE_SIZE = 24;

const MODE_META: Record<EventBrowseSheetMode, { title: string; endpoint: string; paginated: boolean }> = {
  today: { title: '🎪 오늘 전체보기', endpoint: '/api/events/today', paginated: false },
  ongoing: { title: '✅ 현재 이용 가능 전체보기', endpoint: '/api/events/ongoing', paginated: true },
  'reservation-open': { title: '📋 예약 가능 전체보기', endpoint: '/api/events/reservation-open', paginated: true },
};

// [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시) 요구사항 3/4: 기존 3개 전체보기 페이지
// (/events/today, /events/ongoing, /events/reservation-open)의 새 페이지 전환 방식을 폐기하고,
// 스팟픽(AiRecommendSheet/MarkerGroupModal)과 동일한 바텀시트 패턴으로 대체한다. 상단에
// 7대 대분류(category_maj) 필터 칩을 두어 누를 때마다 서버에 category_maj 파라미터를 실어
// 다시 조회한다 — 실측 확인(2026-08-29): 전국 기준 ongoing 1,972건/reservation-open 918건으로
// 클라이언트에 전량을 내려 필터링하기엔 데이터가 커서(중분류만 51종), 기존 오프셋
// 페이지네이션 구조를 그대로 유지한 채 칩을 클릭할 때마다 1페이지부터 다시 조회하는 방식을
// 택했다(스팟픽처럼 완전한 클라이언트 즉시 필터링은 아니지만, 단일 인덱스 쿼리라 체감 지연은
// 크지 않다). "오늘 전체보기"(mode='today')는 원래도 페이지네이션이 없던 화면이라 지역 선택
// 셀렉트를 시트 상단에 그대로 유지한다.
// [실측 디버깅 발견](2026-08-29, ai-recommend-sheet.tsx 동일 이슈): 이 시트는 스팟픽의 AI 추천
// 칩처럼 React onClick(전체보기 버튼)으로 열리므로, history.pushState를 호출하는
// useModalBackClose는 쓰지 않는다(배경 클릭/X 버튼으로만 닫힘).
export function EventBrowseSheet({
  mode,
  onClose,
  onSelectItem,
}: {
  mode: EventBrowseSheetMode;
  onClose: () => void;
  onSelectItem: (item: NearbyItem) => void;
}) {
  const meta = MODE_META[mode];
  const [regionKey, setRegionKey] = useState(DEFAULT_REGION_OPTION.key);
  const [selectedMaj, setSelectedMaj] = useState<string | null>(null);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const buildUrl = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams();
      if (mode === 'today') {
        params.set('region', regionKey);
      } else {
        params.set('page', String(targetPage));
        params.set('page_size', String(PAGE_SIZE));
      }
      if (selectedMaj) params.set('category_maj', selectedMaj);
      return `${meta.endpoint}?${params.toString()}`;
    },
    [mode, meta.endpoint, regionKey, selectedMaj]
  );

  // 지역/칩 필터가 바뀌면 항상 1페이지부터 새로 조회한다.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setPage(1);

    fetch(buildUrl(1))
      .then((res) => res.json())
      .then((data: { items?: NearbyItem[]; total?: number; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const nextItems = data.items ?? [];
        setItems(nextItems);
        setTotal(data.total ?? nextItems.length);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, regionKey, selectedMaj]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setIsLoading(true);
    fetch(buildUrl(nextPage))
      .then((res) => res.json())
      .then((data: { items?: NearbyItem[]; total?: number; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setItems((prev) => [...prev, ...(data.items ?? [])]);
        setTotal((prevTotal) => data.total ?? prevTotal);
        setPage(nextPage);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setIsLoading(false));
  }, [buildUrl, page]);

  const isEmpty = !isLoading && !errorMessage && items.length === 0;
  const hasMorePages = meta.paginated && items.length < total;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[640px] max-h-[85vh] md:max-h-[75vh] flex flex-col bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">{meta.title}</span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 요구사항 4: 중분류(대분류)별 필터 칩 — 누르면 즉시 재조회한다. */}
        <div className="shrink-0 flex flex-col gap-2 p-3 border-b border-gray-100">
          {mode === 'today' && (
            <div className="flex items-center gap-2 px-1">
              <label htmlFor="event-browse-region" className="text-sm text-gray-500 shrink-0">
                지역
              </label>
              <select
                id="event-browse-region"
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
          )}
          <div className="flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              aria-pressed={selectedMaj === null}
              onClick={() => setSelectedMaj(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedMaj === null
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              전체
            </button>
            {CATEGORY_MAJ_OPTIONS.map((opt) => {
              const isActive = selectedMaj === opt.maj;
              return (
                <button
                  key={opt.maj}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setSelectedMaj((prev) => (prev === opt.maj ? null : opt.maj))}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.emoji} {opt.maj}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && items.length === 0 && <p className="text-sm text-gray-400">불러오는 중...</p>}
          {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
          {isEmpty && <EmptyState onReset={() => setSelectedMaj(null)} />}
          {items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((item) => (
                <EventCard key={item.id} item={item} onSelect={onSelectItem} />
              ))}
            </div>
          )}
          {hasMorePages && (
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
