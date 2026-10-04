'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/map/empty-state';
import { EventListSkeleton } from '@/components/cards/event-list-skeleton';
import { BookmarkButton } from '@/components/community/bookmark-button';
import { CULTURE_CLUB_DAY_OPTIONS, CultureClubDay, LOTTEMART_TARGET_OPTIONS, buildLottemartCourseViewUrl } from '@/lib/home/culture-club-options';

// [롯데마트 문화센터 화면](2026-10-04 사용자 지시, reference/lottemart culture.png,
// reference/lottemart culture detail.png 참고): "목록리스트는 강좌명, 개강일/요일/
// 시간, 수강료, 접수상태/수강신청 있네 ... 강좌명에는 제목이랑, 분류랑 연령 대상이
// 있네 ... 수강료쪽엔 가격만 있는게 아니고 4회 28,000원 처럼 횟수도 있네" —
// 이마트 문화센터(culture-club-tab-view.tsx)와 구조적으로 유사한 지점-select+
// 필터-칩+그리드+상세시트 패턴을 따르되, 실제 수집 필드가 달라(필터_status
// 3분류가 아니라 registration_status 4분류, 정원 없음, 할인가 쌍, 재료비 별도
// 등) 별도 컴포넌트로 둔다(2026-10-04 사용자 확인 — 저장/화면 모두 억지로
// 표준화하지 않음, 다만 전체 레이아웃 패턴은 비슷하게 가져감).
const PAGE_SIZE = 20;

type LottemartClass = {
  class_id: string;
  class_title: string;
  store_code: string;
  store_name: string;
  main_category_name: string | null;
  sub_category_name: string | null;
  age_range_text: string | null;
  instructor_name: string | null;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  class_start_date: string | null;
  session_count: number | null;
  class_original_fee: number | null;
  class_fee: number | null;
  class_material_fee: number | null;
  discount_badge_text: string | null;
  is_closing_soon: boolean;
  is_new: boolean;
  like_count: number | null;
  registration_status: '바로신청' | '대기자신청' | '접수마감' | '전화문의';
  semester_code: string;
  target_code: string;
  target_name: string;
};

type StoreOption = { storeCode: string; label: string };

function formatStartDate(raw: string | null) {
  if (!raw || raw.length !== 8) return raw ?? '-';
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

function statusLabel(status: LottemartClass['registration_status']) {
  if (status === '대기자신청') return '대기자 신청';
  return status;
}

// [실측 확인](2026-10-04): 접수마감 상태 버튼을 눌러도 "온라인 접수가
// 마감되었습니다" 안내만 뜨고 실제 신청으로 이어지지 않는다 — 접수마감일 때만
// 액션 버튼을 비활성 처리한다. 나머지(바로신청/대기자신청/전화문의)는 전부
// 롯데마트 상세 페이지(courseview.do)로 보내면 그 페이지의 실제 버튼이 상태에
// 맞게 동작한다(로그인/접수시간대 확인 등은 롯데마트 쪽에서 자연스럽게 처리).
function statusBadgeClassName(status: LottemartClass['registration_status']) {
  if (status === '바로신청') return 'bg-emerald-600 text-white';
  if (status === '대기자신청') return 'bg-amber-500 text-white';
  if (status === '전화문의') return 'bg-gray-500 text-white';
  return 'bg-gray-300 text-gray-600';
}

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FeeLine({ item, size = 'sm' }: { item: LottemartClass; size?: 'sm' | 'lg' }) {
  const priceClass = size === 'lg' ? 'text-lg font-semibold text-gray-900' : 'text-sm font-semibold text-gray-900';
  const subClass = size === 'lg' ? 'text-xs font-normal text-gray-400' : 'text-[11px] font-normal text-gray-400';
  return (
    <p className={priceClass}>
      {item.session_count != null && <span className="mr-1 font-normal text-gray-500">{item.session_count}회</span>}
      {item.class_original_fee != null && (
        <span className={`mr-1 line-through ${subClass}`}>{item.class_original_fee.toLocaleString('ko-KR')}원</span>
      )}
      {item.class_fee != null ? `${item.class_fee.toLocaleString('ko-KR')}원` : '-'}
      {item.class_material_fee != null && (
        <span className={`ml-1 ${subClass}`}>(재료비 {item.class_material_fee.toLocaleString('ko-KR')}원 별도)</span>
      )}
    </p>
  );
}

function ClassCard({ item, onSelect }: { item: LottemartClass; onSelect: (item: LottemartClass) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(item);
      }}
      className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-3 text-left"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {item.discount_badge_text && (
            <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{item.discount_badge_text}</span>
          )}
          {item.is_closing_soon && <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">마감임박</span>}
          {item.is_new && <span className="rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">신설</span>}
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <BookmarkButton target={{ kind: 'lottemart_class', lottemartClassId: item.class_id }} />
        </span>
      </div>
      <p className="text-[11px] text-gray-400">
        {item.main_category_name ?? '-'}
        {item.sub_category_name ? ` > ${item.sub_category_name}` : ''}
        {item.age_range_text ? ` · ${item.age_range_text}` : ''}
      </p>
      <p className="line-clamp-2 text-sm font-medium text-gray-900">{item.class_title}</p>
      <p className="text-[11px] text-gray-400">
        {formatStartDate(item.class_start_date)}({(item.class_day ?? []).join(',')}) {item.start_time ?? '-'}~{item.end_time ?? '-'}
      </p>
      <FeeLine item={item} />
      <span className={`self-start rounded px-1.5 py-0.5 text-[11px] font-semibold ${statusBadgeClassName(item.registration_status)}`}>
        {statusLabel(item.registration_status)}
      </span>
    </div>
  );
}

function LottemartDetailSheet({ item, onClose }: { item: LottemartClass; onClose: () => void }) {
  const courseViewUrl = buildLottemartCourseViewUrl({
    storeCode: item.store_code,
    classId: item.class_id,
    semesterCode: item.semester_code,
    targetCode: item.target_code,
  });
  const isClosed = item.registration_status === '접수마감';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[600px] max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">강좌 상세</span>
          <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-1.5 p-4">
          <p className="text-xs text-gray-400">
            {item.store_name} · {item.main_category_name ?? '-'}
            {item.sub_category_name ? ` > ${item.sub_category_name}` : ''}
            {item.age_range_text ? ` · ${item.age_range_text}` : ''}
          </p>
          <h2 className="text-lg font-bold text-gray-900">{item.class_title}</h2>
          {item.instructor_name && <p className="text-sm text-gray-500">강사 {item.instructor_name}</p>}
          <p className="text-sm text-gray-500">
            개강일 {formatStartDate(item.class_start_date)} ({(item.class_day ?? []).join(',')}) {item.start_time ?? '-'}~{item.end_time ?? '-'}
          </p>
          {item.like_count != null && <p className="text-sm text-gray-500">좋아요 {item.like_count}</p>}
          <hr className="my-1 border-gray-100" />
          <FeeLine item={item} size="lg" />

          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2">
              <BookmarkButton target={{ kind: 'lottemart_class', lottemartClassId: item.class_id }} />
            </div>
            {isClosed ? (
              <span className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-center text-sm font-semibold text-gray-500">접수마감</span>
            ) : (
              <a
                href={courseViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-red-700"
              >
                {statusLabel(item.registration_status)}하러 가기 ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LottemartCultureClubView() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeCode, setStoreCode] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<Set<CultureClubDay>>(new Set());
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<LottemartClass[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<LottemartClass | null>(null);

  useEffect(() => {
    fetch('/api/culture-club/lottemart-stores')
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
      if (selectedTargets.size > 0) params.set('target_code', [...selectedTargets].join(','));
      params.set('page', String(targetPage));
      params.set('page_size', String(PAGE_SIZE));
      return `/api/culture-club/lottemart-classes?${params.toString()}`;
    },
    [storeCode, selectedDays, selectedTargets]
  );

  useEffect(() => {
    if (!storeCode) return;
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setPage(1);

    fetch(buildUrl(1))
      .then((res) => res.json())
      .then((data: { items?: LottemartClass[]; total?: number; error?: string }) => {
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
  }, [storeCode, selectedDays, selectedTargets]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setIsLoading(true);
    fetch(buildUrl(nextPage))
      .then((res) => res.json())
      .then((data: { items?: LottemartClass[]; total?: number; error?: string }) => {
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
    setSelectedTargets(new Set());
  }

  return (
    <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
      <div className="flex flex-col gap-2 p-3 border-b border-gray-100">
        <div className="flex items-center justify-end px-1">
          {(selectedDays.size > 0 || selectedTargets.size > 0) && (
            <button type="button" onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600">
              ↻ 초기화
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 px-1">
          <label htmlFor="lottemart-store" className="text-sm text-gray-500 shrink-0">
            지점
          </label>
          <select
            id="lottemart-store"
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

        <div className="flex gap-1.5 overflow-x-auto px-1">
          {LOTTEMART_TARGET_OPTIONS.map((target) => {
            const isActive = selectedTargets.has(target.code);
            return (
              <button
                key={target.code}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelectedTargets((prev) => toggleInSet(prev, target.code))}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {target.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-1 pb-1">
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
      </div>

      <div className="p-3">
        {isLoading && items.length === 0 && <EventListSkeleton label="문화센터 강좌 불러오는 중" />}
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {isEmpty && <EmptyState onReset={resetFilters} />}
        {items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((item) => (
              <ClassCard key={item.class_id} item={item} onSelect={setSelectedItem} />
            ))}
          </div>
        )}
        {isLoading && items.length > 0 && <p className="mt-4 text-center text-xs text-gray-400">불러오는 중...</p>}
      </div>
      {selectedItem && <LottemartDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
