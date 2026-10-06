'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/map/empty-state';
import { EventListSkeleton } from '@/components/cards/event-list-skeleton';
import { BookmarkButton } from '@/components/community/bookmark-button';
import { BookmarkTarget } from '@/lib/community/bookmarks';
import { useUser } from '@/hooks/use-user';
import { getMyProfile } from '@/lib/auth/profile';
import { canReceivePushNotifications } from '@/lib/community/grades';
import { formatAgeRangeMonths } from '@/lib/home/culture-club-age-format';
import {
  buildCultureClubThumbnailUrl,
  buildLottemartCourseViewUrl,
  CULTURE_CLUB_BRAND_OPTIONS,
  CULTURE_CLUB_DAY_OPTIONS,
  CULTURE_CLUB_SUB_CATEGORY_OPTIONS,
  CultureClubBrandKey,
  CultureClubDay,
  CultureClubSubCategory,
  LOTTEMART_TARGET_OPTIONS,
} from '@/lib/home/culture-club-options';

// [문화센터 통합검색](2026-10-06 사용자 지시, project/decision-log.md Decision
// 028): "동일하게 가는게 낫겠지.. 5개면 5개 탭하는것보다.. 전체 통합검색 및
// 롯데마트나 이마트 필터검색도 가능하게" — 이마트/롯데마트 전용 화면 2개
// (culture-club-tab-view.tsx의 EmartCultureClubView + lottemart-culture-
// club-view.tsx)를 이 파일 하나로 합쳤다. culture_club_classes(brand 컬럼)
// 단일 테이블을 보는 단일 화면으로, 브랜드는 "전체/이마트/롯데마트" 필터
// pill 중 하나일 뿐이다 — 브랜드가 늘어나도(AK플라자 등) CULTURE_CLUB_
// BRAND_OPTIONS에 원소만 추가하면 된다. 지점/카테고리 필터는 브랜드마다
// 코드 체계가 달라 "전체" 선택 시에는 숨기고, 특정 브랜드를 골랐을 때만
// 그 브랜드의 기존 필터(이마트 sub_category_name 5종 / 롯데마트 target_code
// 3종)를 보여준다(제3장 제5조 — 억지로 통일된 카테고리를 지어내지 않음).
const PAGE_SIZE = 20;
const AD_SLOT_INTERVAL = 10;

function buildEmartClassUrl(sourceClassId: string) {
  return `https://www.cultureclub.emart.com/class/${sourceClassId}`;
}

// 브랜드마다 "신청하러 가기" 외부 링크를 만드는 방식이 다르다(이마트는
// class_id만, 롯데마트는 store_code+semester_code+target_code도 필요 —
// 뒤 둘은 공통 컬럼이 아니라 raw_extra에 있다) — 여기서만 분기한다.
function buildExternalApplyUrl(item: CultureClubClass): string | null {
  if (item.brand === 'emart') return buildEmartClassUrl(item.source_class_id);
  if (item.brand === 'lottemart' && item.store_code) {
    const semesterCode = item.raw_extra.semester_code;
    const targetCode = item.raw_extra.target_code;
    if (typeof semesterCode === 'string' && typeof targetCode === 'string') {
      return buildLottemartCourseViewUrl({
        storeCode: item.store_code,
        classId: item.source_class_id,
        semesterCode,
        targetCode,
      });
    }
  }
  return null;
}

// 찜 기능은 아직 브랜드별 kind(emart_class/lottemart_class)를 쓴다 —
// bookmarks.ts가 내부적으로 culture_club_classes.id로 변환해주므로 이 화면은
// 기존 호출 방식을 그대로 재사용한다(2026-10-06 찜 FK 통합, Decision 028).
function toBookmarkTarget(item: CultureClubClass): BookmarkTarget {
  if (item.brand === 'emart') return { kind: 'emart_class', emartClassId: item.source_class_id };
  return { kind: 'lottemart_class', lottemartClassId: item.source_class_id };
}

type StoreOption = { storeCode: string; label: string };

type CultureClubClass = {
  id: number;
  brand: 'emart' | 'lottemart';
  source_class_id: string;
  class_title: string;
  store_code: string | null;
  store_name: string | null;
  main_category_name: string | null;
  sub_category_name: string | null;
  classroom: string | null;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  class_original_fee: number | null;
  class_fee: number | null;
  class_material_fee: number | null;
  instructor_name: string | null;
  min_age_months: number | null;
  max_age_months: number | null;
  schedule_start_date: string | null;
  total_sessions: number | null;
  normalized_status: 'OPEN' | 'CLOSED' | 'WAITING';
  raw_status: string | null;
  register_start_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_extra: Record<string, any>;
  collected_at: string;
};

const BRAND_LABELS: Record<CultureClubClass['brand'], string> = {
  emart: '이마트',
  lottemart: '롯데마트',
};

function formatTimeRange(start: string | null, end: string | null) {
  const fmt = (t: string | null) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t ?? '-');
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function formatScheduleDate(raw: string | null) {
  return raw ? raw.replaceAll('-', '.') : '-';
}

function formatRegisterStart(raw: string | null) {
  if (!raw) return '-';
  const date = new Date(raw);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// [데이터 신선도 안내] 상태가 일 1회 배치 갱신임을 숨기지 않고 그대로 보여준다
// (이전 두 화면의 동일 패턴 유지, 제3장 제5조 — 실시간인 척하지 않음).
function formatUpdatedAt(raw: string) {
  const date = new Date(raw);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}.${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// [공통 상태 배지] 색상은 normalized_status(OPEN/WAITING/CLOSED) 3단계로
// 통일하되, 라벨은 브랜드 고유 표기(raw_status, 예: "접수중"/"바로신청")를
// 그대로 보여준다 — 색 체계는 통일하면서 브랜드별 구체적 표현은 잃지 않는다.
function statusBadgeClassName(status: CultureClubClass['normalized_status']) {
  if (status === 'OPEN') return 'bg-emerald-600 text-white';
  if (status === 'WAITING') return 'bg-amber-500 text-white';
  return 'bg-gray-400 text-white';
}

function statusLabel(item: CultureClubClass) {
  return item.raw_status ?? item.normalized_status;
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

function ClassImage({ item }: { item: CultureClubClass }) {
  // [이미지 — 이마트만 있음, 실측 확인] 롯데마트 목록 응답에는 썸네일 이미지가
  // 전혀 없다 — 다른 브랜드는 전부 플레이스홀더로 폴백한다.
  const imageKey = item.brand === 'emart' ? (item.raw_extra.main_image_key as string | null | undefined) : null;
  const thumbnailUrl = buildCultureClubThumbnailUrl(imageKey);
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-t-xl bg-gray-100">
      <span className={`absolute left-2 top-2 z-10 rounded px-1.5 py-0.5 text-[11px] font-semibold ${statusBadgeClassName(item.normalized_status)}`}>
        {statusLabel(item)}
      </span>
      <span className="absolute right-2 top-2 z-10 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {BRAND_LABELS[item.brand]}
      </span>
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl text-gray-300" aria-hidden>
          🏫
        </div>
      )}
    </div>
  );
}

function ClassCard({ item, onSelect }: { item: CultureClubClass; onSelect: (item: CultureClubClass) => void }) {
  const hasMaterialFee = item.class_material_fee != null && item.class_material_fee > 0;
  const ageLabel = formatAgeRangeMonths(item.min_age_months, item.max_age_months);
  // 롯데마트 전용 배지(할인/마감임박/신설)는 raw_extra에 있다 — 이마트는 해당 없음.
  const discountBadge = item.brand === 'lottemart' ? (item.raw_extra.discount_badge_text as string | null) : null;
  const isClosingSoon = item.brand === 'lottemart' ? Boolean(item.raw_extra.is_closing_soon) : false;
  const isNew = item.brand === 'lottemart' ? Boolean(item.raw_extra.is_new) : false;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(item);
      }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left"
    >
      <ClassImage item={item} />
      <div className="flex flex-col gap-1 p-2.5">
        {(discountBadge || isClosingSoon || isNew) && (
          <div className="flex items-center gap-1">
            {discountBadge && <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{discountBadge}</span>}
            {isClosingSoon && <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">마감임박</span>}
            {isNew && <span className="rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">신설</span>}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            {item.sub_category_name ?? '-'}
            {ageLabel ? ` · ${ageLabel}` : ''}
          </span>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-gray-900">{item.class_title}</p>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">
            {item.class_fee != null ? `${item.class_fee.toLocaleString('ko-KR')}원` : '무료'}
            {hasMaterialFee && (
              <span className="ml-1 text-[11px] font-normal text-gray-400">
                (재료비 {item.class_material_fee!.toLocaleString('ko-KR')}원 포함)
              </span>
            )}
          </p>
          <span onClick={(e) => e.stopPropagation()}>
            <BookmarkButton target={toBookmarkTarget(item)} />
          </span>
        </div>
        <hr className="my-0.5 border-gray-100" />
        <p className="text-[11px] text-gray-400">
          {item.store_name ?? ''} 일정 {(item.class_day ?? []).join(',')} {formatTimeRange(item.start_time, item.end_time)}
        </p>
      </div>
    </div>
  );
}

// [접수 시작 안내 — 우수맘 전용] register_start_at이 아직 미래인 강좌에 한해
// 예약 알람 대상 등급에게만 안내한다(기존 두 화면의 동일 패턴 유지).
function CultureClubReservationHint({ item }: { item: CultureClubClass }) {
  const { user } = useUser();
  const [canShow, setCanShow] = useState(false);

  useEffect(() => {
    if (!user) {
      setCanShow(false);
      return;
    }
    let cancelled = false;
    getMyProfile().then((profile) => {
      if (!cancelled) setCanShow(Boolean(profile && canReceivePushNotifications(profile.grade)));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isUpcoming = item.register_start_at != null && new Date(item.register_start_at).getTime() > Date.now();
  if (!canShow || !isUpcoming) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">🔔 접수 시작 안내</p>
      <p className="mt-0.5 text-xs text-amber-700">
        {formatRegisterStart(item.register_start_at)}에 접수가 시작돼요 — 찜(❤️)해두면 미리 알림을 보내드려요.
      </p>
    </div>
  );
}

function CultureClubDetailSheet({ item, onClose }: { item: CultureClubClass; onClose: () => void }) {
  const [isIntroOpen, setIsIntroOpen] = useState(true);
  const hasMaterialFee = item.class_material_fee != null && item.class_material_fee > 0;
  const ageLabel = formatAgeRangeMonths(item.min_age_months, item.max_age_months);
  const imageKey = item.brand === 'emart' ? (item.raw_extra.main_image_key as string | null | undefined) : null;
  const thumbnailUrl = buildCultureClubThumbnailUrl(imageKey);
  const externalUrl = buildExternalApplyUrl(item);
  // 접수마감/접수불가(롯데마트) 상태일 땐 외부 신청 버튼을 비활성 처리한다
  // (실측 확인 — 눌러도 "접수가 마감되었습니다" 안내만 뜨고 신청으로 안 이어짐).
  const isClosed = item.raw_status === '접수마감' || item.raw_status === '접수불가';

  // 브랜드마다 "소개" 텍스트가 다른 raw_extra 키에 있다(이마트: class_detail_title/
  // content, 롯데마트: class_intro/class_tip) — 있는 쪽만 보여준다.
  const introTitle = item.brand === 'emart' ? (item.raw_extra.class_detail_title as string | null) : null;
  const introBody =
    item.brand === 'emart' ? (item.raw_extra.class_detail_content as string | null) : (item.raw_extra.class_intro as string | null);
  const introExtra = item.brand === 'lottemart' ? (item.raw_extra.class_tip as string | null) : null;

  const capacity = item.brand === 'emart' ? (item.raw_extra.class_capacity as number | null) : null;
  const likeCount = item.brand === 'lottemart' ? (item.raw_extra.like_count as number | null) : null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[720px] max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">{BRAND_LABELS[item.brand]} 강좌 상세</span>
          <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 p-4">
          <div className="relative aspect-square w-full md:w-1/2 overflow-hidden rounded-xl bg-gray-100 shrink-0">
            <span
              className={`absolute left-2 top-2 z-10 rounded px-1.5 py-0.5 text-[11px] font-semibold ${statusBadgeClassName(item.normalized_status)}`}
            >
              {statusLabel(item)}
            </span>
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl text-gray-300" aria-hidden>
                🏫
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 md:w-1/2">
            <span className="text-xs text-gray-400">
              {item.sub_category_name ?? '-'}
              {ageLabel ? ` · ${ageLabel}` : ''}
            </span>
            <h2 className="text-lg font-bold text-gray-900">{item.class_title}</h2>
            {item.instructor_name && <p className="text-sm text-gray-500">강사 {item.instructor_name}</p>}
            <p className="text-lg font-semibold text-gray-900">
              {item.class_fee != null ? `${item.class_fee.toLocaleString('ko-KR')}원` : '무료'}
              {hasMaterialFee && (
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (재료비 {item.class_material_fee!.toLocaleString('ko-KR')}원 포함)
                </span>
              )}
            </p>
            <hr className="my-1 border-gray-100" />
            <p className="text-sm text-gray-500">
              {formatScheduleDate(item.schedule_start_date)} ({(item.class_day ?? []).join(',')}) {formatTimeRange(item.start_time, item.end_time)}
              {item.total_sessions != null ? ` · 총 ${item.total_sessions}회` : ''}
            </p>
            {item.store_name && <p className="text-sm text-gray-500">접수가능지점 {item.store_name}</p>}
            {capacity != null && <p className="text-sm text-gray-500">정원 {capacity}명</p>}
            {likeCount != null && <p className="text-sm text-gray-500">좋아요 {likeCount}</p>}

            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2">
                <BookmarkButton target={toBookmarkTarget(item)} />
              </div>
              {externalUrl && !isClosed ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-orange-600"
                >
                  {statusLabel(item)}하러 가기 ↗
                </a>
              ) : (
                <span className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-center text-sm font-semibold text-gray-500">
                  {statusLabel(item)}
                </span>
              )}
            </div>
            <CultureClubReservationHint item={item} />
          </div>
        </div>

        {(introBody || introExtra) && (
          <div className="border-t border-gray-100 p-4">
            <button
              type="button"
              onClick={() => setIsIntroOpen((prev) => !prev)}
              className="flex w-full items-center justify-between text-sm font-semibold text-gray-900"
            >
              클래스소개
              <span className="text-gray-400">{isIntroOpen ? '▲' : '▼'}</span>
            </button>
            {isIntroOpen && (
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                {introTitle && <p className="mb-1 font-medium text-gray-800">{introTitle}</p>}
                {introBody}
                {introExtra && <p className="mt-2 text-xs text-gray-500">{introExtra}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CultureClubTabView() {
  const [brandKey, setBrandKey] = useState<CultureClubBrandKey>('all');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeCode, setStoreCode] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<Set<CultureClubDay>>(new Set());
  const [selectedSubCategories, setSelectedSubCategories] = useState<Set<CultureClubSubCategory>>(new Set());
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<CultureClubClass[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CultureClubClass | null>(null);

  // [지점 — 브랜드별 전용 목록] 지점 코드 네임스페이스가 브랜드마다 달라 "전체"
  // 선택 시에는 지점 필터 자체를 숨긴다(특정 브랜드를 짐작해서 보여주지 않음).
  useEffect(() => {
    setStoreCode(null);
    setSelectedSubCategories(new Set());
    setSelectedTargets(new Set());
    if (brandKey === 'all') {
      setStores([]);
      return;
    }
    const endpoint = brandKey === 'emart' ? '/api/culture-club/stores' : '/api/culture-club/lottemart-stores';
    fetch(endpoint)
      .then((res) => res.json())
      .then((data: { stores?: StoreOption[] }) => {
        const list = data.stores ?? [];
        setStores(list);
        setStoreCode(list[0]?.storeCode ?? null);
      })
      .catch(() => setStores([]));
  }, [brandKey]);

  const buildUrl = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams();
      if (brandKey !== 'all') params.set('brand', brandKey);
      if (brandKey !== 'all' && storeCode) params.set('store_code', storeCode);
      if (selectedDays.size > 0) params.set('days', [...selectedDays].join(','));
      if (brandKey === 'emart' && selectedSubCategories.size > 0) params.set('sub_category_name', [...selectedSubCategories].join(','));
      if (brandKey === 'lottemart' && selectedTargets.size > 0) params.set('target_code', [...selectedTargets].join(','));
      params.set('page', String(targetPage));
      params.set('page_size', String(PAGE_SIZE));
      return `/api/culture-club/search?${params.toString()}`;
    },
    [brandKey, storeCode, selectedDays, selectedSubCategories, selectedTargets]
  );

  // 브랜드가 특정 마트인데 아직 지점 목록을 못 받아온 상태(storeCode가 아직
  // null)에서는 조회하지 않는다 — "전체"는 지점이 필요 없으니 바로 조회한다.
  const isWaitingForStore = brandKey !== 'all' && !storeCode;

  useEffect(() => {
    if (isWaitingForStore) return;
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
  }, [brandKey, storeCode, selectedDays, selectedSubCategories, selectedTargets, isWaitingForStore]);

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
  const hasActiveFilters = selectedDays.size > 0 || selectedSubCategories.size > 0 || selectedTargets.size > 0;

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
    setSelectedTargets(new Set());
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        <div className="flex flex-col gap-2 p-3 border-b border-gray-100">
          {/* 브랜드 필터 — 전체(기본)/이마트/롯데마트. */}
          <div className="flex items-center gap-2 px-1">
            {CULTURE_CLUB_BRAND_OPTIONS.map((brand) => {
              const isActive = brandKey === brand.key;
              return (
                <button
                  key={brand.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setBrandKey(brand.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {brand.label}
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-end px-1">
              <button type="button" onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600">
                ↻ 초기화
              </button>
            </div>
          )}

          {/* 지점 선택 — "전체"일 땐 지점 네임스페이스가 브랜드마다 달라 숨긴다. */}
          {brandKey !== 'all' && (
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
          )}

          {/* 요일 필터 — 다중선택 OR, 모든 브랜드 공통. */}
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

          {/* 카테고리(이마트)/대상(롯데마트) 필터 — 분류 체계가 서로 달라 "전체"
              에서는 숨기고, 해당 브랜드를 골랐을 때만 그 브랜드의 필터를 보여준다. */}
          {brandKey === 'emart' && (
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
          )}
          {brandKey === 'lottemart' && (
            <div className="flex gap-1.5 overflow-x-auto px-1 pb-1">
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
          )}
        </div>

        <div className="p-3">
          {isLoading && items.length === 0 && <EventListSkeleton label="문화센터 강좌 불러오는 중" />}
          {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
          {isEmpty && <EmptyState onReset={resetFilters} />}
          {items.length > 0 && (
            <p className="mb-2 text-[11px] text-gray-400">
              ⏱ 마지막 업데이트 {formatUpdatedAt(items[0].collected_at)} · 접수 상태는 하루 1회 갱신돼요(찜하면 더 자주 확인해 알려드려요)
            </p>
          )}
          {items.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {items.map((item, index) =>
                (index + 1) % AD_SLOT_INTERVAL === 0 ? (
                  <div key={item.id} className="contents">
                    <div className="col-span-full">
                      <CultureClubAdSlot />
                    </div>
                    <ClassCard item={item} onSelect={setSelectedItem} />
                  </div>
                ) : (
                  <ClassCard key={item.id} item={item} onSelect={setSelectedItem} />
                )
              )}
            </div>
          )}
          {isLoading && items.length > 0 && <p className="mt-4 text-center text-xs text-gray-400">불러오는 중...</p>}
        </div>
      </div>
      {selectedItem && <CultureClubDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
