'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/map/empty-state';
import { EventListSkeleton } from '@/components/cards/event-list-skeleton';
import {
  CULTURE_CLUB_BRAND_OPTIONS,
  CULTURE_CLUB_DAY_OPTIONS,
  CULTURE_CLUB_SUB_CATEGORY_OPTIONS,
  CultureClubDay,
  CultureClubSubCategory,
} from '@/lib/home/culture-club-options';

const PAGE_SIZE = 20;
// [광고 자리 스캐폴딩](2026-10-03 사용자 지시): "5번째 혹은 10번째 카드마다 ... 스폰서드/
// 추천 상품 카드 자리 기능적으로 마련" — 실제 광고 콘텐츠/스폰서 테이블은 이번 범위가
// 아니다(제5장 제7조 — 확장 구조는 허용, 확장 기능 자체는 구현하지 않음). 자리만 끼워
// 두고 CultureClubAdSlot은 아직 null을 반환한다.
const AD_SLOT_INTERVAL = 10;

type StoreOption = { storeCode: string; label: string };

type CultureClubClass = {
  class_id: string;
  class_title: string;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  sub_category_name: string | null;
  store_name: string | null;
  class_fee: number | null;
  class_capacity: number | null;
  filter_status: '접수대기' | '접수중' | '정원마감';
  register_start_date: string | null;
  class_start_date: string | null;
  class_end_date: string | null;
};

function formatTimeRange(start: string | null, end: string | null) {
  const fmt = (t: string | null) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t ?? '-');
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function formatDateCompact(raw: string | null) {
  if (!raw || raw.length !== 8) return raw ?? '-';
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

function statusLabel(status: CultureClubClass['filter_status']) {
  return status === '정원마감' ? '대기접수 가능' : status;
}

function statusBadgeClassName(status: CultureClubClass['filter_status']) {
  if (status === '정원마감') return 'bg-amber-500 text-white';
  if (status === '접수중') return 'bg-emerald-50 text-emerald-700';
  return 'bg-gray-100 text-gray-600';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CultureClubAdSlot() {
  return null;
}

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function ClassRow({ item }: { item: CultureClubClass }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{item.class_title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClassName(item.filter_status)}`}>
          {statusLabel(item.filter_status)}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {item.sub_category_name ?? '-'} · {(item.class_day ?? []).join(',')} {formatTimeRange(item.start_time, item.end_time)}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {item.class_fee != null ? `${item.class_fee.toLocaleString('ko-KR')}원` : '무료'}
        {item.class_capacity != null ? ` · 정원 ${item.class_capacity}명` : ''}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        강좌기간 {formatDateCompact(item.class_start_date)} ~ {formatDateCompact(item.class_end_date)}
      </p>
    </div>
  );
}

export function CultureClubSheet({ onClose }: { onClose: () => void }) {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeCode, setStoreCode] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<Set<CultureClubDay>>(new Set());
  const [selectedSubCategories, setSelectedSubCategories] = useState<Set<CultureClubSubCategory>>(new Set());
  const [items, setItems] = useState<CultureClubClass[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 지점 목록은 한 번만 불러온다(브랜드가 1개뿐이라 전환 시 재조회 불필요 — 브랜드가
  // 늘어나면 이 effect에 brandKey 의존성을 추가한다).
  useEffect(() => {
    fetch('/api/culture-club/stores')
      .then((res) => res.json())
      .then((data: { stores?: StoreOption[] }) => {
        const list = data.stores ?? [];
        setStores(list);
        setStoreCode((prev) => prev ?? list[0]?.storeCode ?? null);
      })
      .catch(() => setStores([]));
  }, []);

  const buildUrl = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams();
      params.set('store_code', storeCode ?? '');
      if (selectedDays.size > 0) params.set('days', [...selectedDays].join(','));
      if (selectedSubCategories.size > 0) params.set('sub_category_name', [...selectedSubCategories].join(','));
      params.set('page', String(targetPage));
      params.set('page_size', String(PAGE_SIZE));
      return `/api/culture-club/classes?${params.toString()}`;
    },
    [storeCode, selectedDays, selectedSubCategories]
  );

  // 지점/요일/카테고리 필터가 바뀌면 항상 1페이지부터 새로 조회한다(event-browse-sheet.tsx와
  // 동일한 패턴).
  useEffect(() => {
    if (!storeCode) return;
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setPage(1);

    fetch(buildUrl(1))
      .then((res) => res.json())
      .then((data: { items?: CultureClubClass[]; total?: number; error?: string }) => {
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
  }, [storeCode, selectedDays, selectedSubCategories]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setIsLoading(true);
    fetch(buildUrl(nextPage))
      .then((res) => res.json())
      .then((data: { items?: CultureClubClass[]; total?: number; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setItems((prev) => [...prev, ...(data.items ?? [])]);
        setTotal((prevTotal) => data.total ?? prevTotal);
        setPage(nextPage);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setIsLoading(false));
  }, [buildUrl, page]);

  const isEmpty = !isLoading && !errorMessage && items.length === 0;
  const hasMorePages = items.length < total;

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!hasMorePages || isLoading) return;
    const el = e.currentTarget;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 150) {
      loadMore();
    }
  }

  function resetFilters() {
    setSelectedDays(new Set());
    setSelectedSubCategories(new Set());
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[640px] max-h-[85vh] md:max-h-[75vh] flex flex-col bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">🏫 문화센터 강좌</span>
          <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="shrink-0 flex flex-col gap-2 p-3 border-b border-gray-100">
          {/* 브랜드 세그먼트 — 지금은 1개뿐이라 선택 UI라기보다 라벨 표시. */}
          <div className="flex items-center gap-2 px-1">
            {CULTURE_CLUB_BRAND_OPTIONS.map((brand) => (
              <span key={brand.key} className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
                {brand.label}
              </span>
            ))}
          </div>

          {/* 지점 선택 — 단일선택, 클릭 한 번으로 바로 전환된다(네이티브 select). */}
          <div className="flex items-center gap-2 px-1">
            <label htmlFor="culture-club-store" className="text-sm text-gray-500 shrink-0">
              지점
            </label>
            <select
              id="culture-club-store"
              value={storeCode ?? ''}
              onChange={(e) => setStoreCode(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              {stores.map((store) => (
                <option key={store.storeCode} value={store.storeCode}>
                  {store.label}
                </option>
              ))}
            </select>
          </div>

          {/* 요일 필터 — 다중선택 OR. */}
          <div className="flex gap-1.5 overflow-x-auto px-1">
            {CULTURE_CLUB_DAY_OPTIONS.map((day) => {
              const isActive = selectedDays.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setSelectedDays((prev) => toggleInSet(prev, day))}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* 카테고리 필터 — 다중선택 OR. */}
          <div className="flex gap-1.5 overflow-x-auto px-1 pb-1">
            {CULTURE_CLUB_SUB_CATEGORY_OPTIONS.map((category) => {
              const isActive = selectedSubCategories.has(category);
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setSelectedSubCategories((prev) => toggleInSet(prev, category))}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4" onScroll={handleScroll}>
          {isLoading && items.length === 0 && <EventListSkeleton label="문화센터 강좌 불러오는 중" />}
          {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
          {isEmpty && <EmptyState onReset={resetFilters} />}
          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((item, index) => (
                <div key={item.class_id}>
                  {(index + 1) % AD_SLOT_INTERVAL === 0 && <CultureClubAdSlot />}
                  <ClassRow item={item} />
                </div>
              ))}
            </div>
          )}
          {isLoading && items.length > 0 && <p className="mt-4 text-center text-xs text-gray-400">불러오는 중...</p>}
        </div>
      </div>
    </div>
  );
}
