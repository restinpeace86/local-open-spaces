'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/map/empty-state';
import { EventListSkeleton } from '@/components/cards/event-list-skeleton';
import { BookmarkButton } from '@/components/community/bookmark-button';
import { BookmarkTarget } from '@/lib/community/bookmarks';
import { useUser } from '@/hooks/use-user';
import { useUserLocation } from '@/hooks/use-user-location';
import { getMyProfile } from '@/lib/auth/profile';
import { canReceivePushNotifications } from '@/lib/community/grades';
import { calculateTotalMonthsFromBirthYearsAndMonths } from '@/lib/ai-chat/personalization';
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
// 롯데마트나 이마트 필터검색도 가능하게" — 이마트/롯데마트 전용 화면 2개를
// 이 파일 하나로 합쳤다.
//
// [1차 검색조건 — 아이 연령 + 위치](2026-10-07 사용자 지시): "온보딩때 입력한
// 아이 년생을 기준으로 데이터 가져올꺼야 ... 아이가 2명이고 나이가 다를경우는
// 아이 나이 스위칭할경우 거기에 맞게 데이터가 필터링 ... 또하나의 조건은
// 위치조건이야 현재 본인 위치기준으로 가까운거 기준으로 ... 위의 2개는
// 기본인거야." 로그인/온보딩 데이터가 있으면 묻지 않고 자동으로 적용한다(브랜드/
// 요일처럼 사용자가 매번 고르는 "2차 조건"과는 성격이 다르다 — 항상 깔려
// 있는 기본값). 아이 정보가 아예 없으면(비로그인/온보딩 미완료) 추측 없이
// 그냥 생략한다.
const PAGE_SIZE = 20;
const AD_SLOT_INTERVAL = 10;
const CHILD_ORDINAL_LABELS = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
// [Branch-First 반경 선택](2026-10-07 todo.md 개선사항1-1): "사용자가 앱 내에서
// 반경(예: 5km, 10km, 20km 등)을 직접 변경할 수 있는 거리 선택 필터... 기본값
// 10km" — map-explorer.tsx의 바텀시트 반경 선택(5/10/20km, 기본 10km)과 동일한
// 값 구성을 그대로 따른다(제5장 제4조 기존 구조 우선).
const RADIUS_KM_OPTIONS = [5, 10, 20] as const;
const DEFAULT_RADIUS_KM = 10;

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

type StoreOption = { storeCode: string; label: string; distanceMeters?: number | null };

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
  // [위치 기반 정렬](2026-10-07) — lat/lng 파라미터가 있을 때만 API가 채워준다.
  distance_meters?: number | null;
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

// [위치 표시] 참고 화면(reference/moonsen_mobile.png)처럼 "0.7km" 식으로
// 보여준다 — 1km 미만은 "~m"로 더 정밀하게.
function formatDistanceLabel(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
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

// [카드 레이아웃 재설계](2026-10-07 사용자 지시, reference/moonsen_mobile.png·
// moonsen_pc.png 참고): "썸네일이 왼쪽에 있고 그 썸네일 왼쪽상단에 접수중이라던가
// 뱃지 있고 옆쪽에 제목있고 뱃지있고.. 가격 좀 크게 나오고.. 수업 접수나
// 위치등 나오지" — 세로(이미지 위) 그리드 카드를 참고 화면처럼 가로(이미지
// 왼쪽, 작은 정사각형) 리스트 카드로 바꿨다. "완전 똑같이는 아니지만..
// 우리는 더 풍부하게"라는 지시에 따라 참고 화면엔 없는 연령 범위/브랜드
// 뱃지/신설·할인 뱃지를 함께 보여준다.
function ClassImage({ item }: { item: CultureClubClass }) {
  // [이미지 — 이마트만 있음, 실측 확인] 롯데마트 목록 응답에는 썸네일 이미지이
  // 전혀 없다 — 다른 브랜드는 전부 플레이스홀더로 폴백한다. 이마트도 실제로
  // main_image_key가 있는 강좌는 전체의 8% 정도뿐이다(반복되는 정규 강좌엔
  // 원본 API 자체가 사진을 안 준다 — 추측 금지, 실측 확인) — 나머지는 전부
  // 플레이스홀더로 보이는 게 정상 동작이다.
  // [픽셀 비율 — 실측 확인](2026-10-07 사용자 지적: "픽셀 맞춘거 맞아?") 실제
  // CDN 원본이 정사각형이 아니라 가로형(271×173, 616×416 등 약 3:2)이라
  // 정사각형(96×96) 박스에 넣으면 과도하게 크롭됐다 — 가로로 조금 더 넓은
  // 박스(112×96)로 바꿔 크롭을 줄인다.
  const imageKey = item.brand === 'emart' ? (item.raw_extra.main_image_key as string | null | undefined) : null;
  const thumbnailUrl = buildCultureClubThumbnailUrl(imageKey);
  return (
    <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100">
      <span
        className={`absolute left-1 top-1 z-10 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${statusBadgeClassName(item.normalized_status)}`}
      >
        {statusLabel(item)}
      </span>
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl text-gray-300" aria-hidden>
          🏫
        </div>
      )}
    </div>
  );
}

function ClassCard({ item, onSelect }: { item: CultureClubClass; onSelect: (item: CultureClubClass) => void }) {
  const hasMaterialFee = item.class_material_fee != null && item.class_material_fee > 0;
  const ageLabel = formatAgeRangeMonths(item.min_age_months, item.max_age_months);
  const distanceLabel = formatDistanceLabel(item.distance_meters);
  // 롯데마트 전용 배지(할인/마감임박/신설)는 raw_extra에 있다 — 이마트는 해당 없음.
  const discountBadge = item.brand === 'lottemart' ? (item.raw_extra.discount_badge_text as string | null) : null;
  const isClosingSoon = item.brand === 'lottemart' ? Boolean(item.raw_extra.is_closing_soon) : false;
  const isNew = item.brand === 'lottemart' ? Boolean(item.raw_extra.is_new) : false;
  const hasSpecialBadge = Boolean(discountBadge) || isClosingSoon || isNew;
  // [접수일자 표시](2026-10-07 사용자 지적: "수업일자 요일 시간 말고 접수
  // 일자는 왜 안보이지? 이마트는 접수일자 있지 않나") — register_start_at은
  // 이마트만 값이 있다(실측 확인, 롯데마트는 전용 필드가 없어 늘 null) —
  // 없으면 추측해서 만들어내지 않고 그냥 줄 자체를 생략한다.
  const registerStartLabel = item.register_start_at ? formatRegisterStart(item.register_start_at) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(item);
      }}
      className="flex cursor-pointer gap-3 rounded-xl border border-gray-200 bg-white p-2.5 text-left"
    >
      <ClassImage item={item} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-2 flex-1 text-sm font-medium text-gray-900">{item.class_title}</p>
          <span onClick={(e) => e.stopPropagation()} className="-mt-1 shrink-0">
            <BookmarkButton target={toBookmarkTarget(item)} />
          </span>
        </div>
        {/* [브랜드 뱃지 제거](2026-10-07 사용자 지적: "롯데몰수지점 8.5km
            되어있는데 롯데마트 뱃지가 위에 안나와도 되지 않나?") — 아래
            위치 줄(📍 지점명 · 거리)이 이미 브랜드/위치를 전달해 중복이었다.
            할인/마감임박/신설처럼 실제로 다른 정보를 주는 뱃지만 남긴다. */}
        {hasSpecialBadge && (
          <div className="flex flex-wrap items-center gap-1">
            {discountBadge && <span className="shrink-0 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{discountBadge}</span>}
            {isClosingSoon && <span className="shrink-0 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">마감임박</span>}
            {isNew && <span className="shrink-0 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">신설</span>}
          </div>
        )}
        <p className="text-[11px] text-gray-400">
          {item.sub_category_name ?? '-'}
          {ageLabel ? ` · ${ageLabel}` : ''}
        </p>
        {/* [회차 표시 추가](2026-10-07 사용자 지적: "가격 관련 몇회 몇만원
            아니었어? 몇회가 안보여 상세 들어가야 보여") — total_sessions를
            가격 옆에 바로 보여준다. */}
        <p className="flex items-baseline gap-1 text-base font-bold text-gray-900">
          {item.total_sessions != null && <span className="text-xs font-semibold text-gray-500">{item.total_sessions}회</span>}
          {item.class_fee != null ? `${item.class_fee.toLocaleString('ko-KR')}원` : '무료'}
          {hasMaterialFee && (
            <span className="text-[11px] font-normal text-gray-400">(재료비 {item.class_material_fee!.toLocaleString('ko-KR')}원 포함)</span>
          )}
        </p>
        <p className="truncate text-[11px] text-gray-400">
          🗓 {(item.class_day ?? []).join(',')} {formatTimeRange(item.start_time, item.end_time)}
        </p>
        {registerStartLabel && <p className="truncate text-[11px] text-gray-400">📅 접수 {registerStartLabel}</p>}
        <p className="truncate text-[11px] text-gray-400">
          📍 {item.store_name ?? '-'}
          {distanceLabel ? ` · ${distanceLabel}` : ''}
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
  const distanceLabel = formatDistanceLabel(item.distance_meters);
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
            {item.store_name && (
              <p className="text-sm text-gray-500">
                접수가능지점 {item.store_name}
                {distanceLabel ? ` · ${distanceLabel}` : ''}
              </p>
            )}
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

// [아이 연령 기본 필터 — 배너 + 스위처](2026-10-07 사용자 지시): "아이가
// 몇년생이고 이 기준에 부합하는 데이터들만 보여줄꺼야.. 아이가 2명이고
// 나이가 다를경우는 아이 나이 스위칭할경우 거기에 맞게 필터링." 온보딩에서
// 입력한 birth_years/birth_months(둘 다 있어야 계산 가능)가 있을 때만
// 보여준다 — 없으면(비로그인/온보딩 미완료) 추측 없이 생략한다.
function ChildAgeBanner({
  children,
  activeIndex,
  onSwitch,
}: {
  children: { ageMonths: number }[];
  activeIndex: number;
  onSwitch: (index: number) => void;
}) {
  if (children.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-3 pt-2">
      <span className="shrink-0 text-xs text-gray-400">👶 기준</span>
      {children.map((child, index) => {
        const label = CHILD_ORDINAL_LABELS[index] ?? `${index + 1}번째`;
        const ageLabel = formatAgeRangeMonths(child.ageMonths, child.ageMonths);
        const isActive = index === activeIndex;
        return (
          <button
            key={index}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSwitch(index)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
            }`}
          >
            {children.length > 1 ? `${label} ` : ''}
            {ageLabel}
          </button>
        );
      })}
    </div>
  );
}

export function CultureClubTabView() {
  const { user } = useUser();
  const { center } = useUserLocation();
  const [profile, setProfile] = useState<{ birth_years: number[]; birth_months: number[] } | null>(null);
  const [activeChildIndex, setActiveChildIndex] = useState(0);

  const [brandKey, setBrandKey] = useState<CultureClubBrandKey>('all');
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreCodes, setSelectedStoreCodes] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<Set<CultureClubDay>>(new Set());
  const [selectedSubCategories, setSelectedSubCategories] = useState<Set<CultureClubSubCategory>>(new Set());
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [items, setItems] = useState<CultureClubClass[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CultureClubClass | null>(null);

  // [아이 연령 — 1차 검색조건] 로그인 + 온보딩에서 받은 birth_years/
  // birth_months로 계산한다. calculateTotalMonthsFromBirthYearsAndMonths가
  // 이미 "둘 다 있어야 계산 가능, 음수(미래 출생)는 제외" 로직을 갖고 있다
  // (src/lib/ai-chat/personalization.ts).
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (!cancelled) setProfile(p ? { birth_years: p.birth_years, birth_months: p.birth_months } : null);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const children = useMemo(() => {
    if (!profile) return [];
    return calculateTotalMonthsFromBirthYearsAndMonths(profile.birth_years, profile.birth_months).map((ageMonths) => ({ ageMonths }));
  }, [profile]);
  const activeAgeMonths = children[activeChildIndex]?.ageMonths ?? null;

  // [지점 — 브랜드별 전용 목록, 반경 내로 좁힘](2026-10-07 todo.md 개선사항1-3):
  // "전체 지점이 나오는 게 아니라 사용자가 설정한 거리 반경 내로 필터링된
  // 지점들만 뱃지 형태로 나열" — 지점 코드 네임스페이스가 브랜드마다 달라
  // "전체" 선택 시에는 지점 필터 자체를 숨긴다. 브랜드/반경이 바뀌면 선택된
  // 지점은 초기화한다("아무 지점도 선택하지 않았을 때는 전체 지점 선택과
  // 동일" — 자동으로 첫 지점을 골라두지 않는다).
  useEffect(() => {
    setSelectedStoreCodes(new Set());
    setSelectedSubCategories(new Set());
    setSelectedTargets(new Set());
    if (brandKey === 'all') {
      setStores([]);
      return;
    }
    const endpoint = brandKey === 'emart' ? '/api/culture-club/stores' : '/api/culture-club/lottemart-stores';
    const params = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), radius_km: String(radiusKm) });
    fetch(`${endpoint}?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { stores?: StoreOption[] }) => setStores(data.stores ?? []))
      .catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey, radiusKm, center.lat, center.lng]);

  const buildUrl = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams();
      if (brandKey !== 'all') params.set('brand', brandKey);
      if (brandKey !== 'all' && selectedStoreCodes.size > 0) params.set('store_codes', [...selectedStoreCodes].join(','));
      if (selectedDays.size > 0) params.set('days', [...selectedDays].join(','));
      if (brandKey === 'emart' && selectedSubCategories.size > 0) params.set('sub_category_name', [...selectedSubCategories].join(','));
      if (brandKey === 'lottemart' && selectedTargets.size > 0) params.set('target_code', [...selectedTargets].join(','));
      if (appliedQuery) params.set('q', appliedQuery);
      if (activeAgeMonths != null) params.set('age_months', String(activeAgeMonths));
      params.set('lat', String(center.lat));
      params.set('lng', String(center.lng));
      params.set('radius_km', String(radiusKm));
      params.set('page', String(targetPage));
      params.set('page_size', String(PAGE_SIZE));
      return `/api/culture-club/search?${params.toString()}`;
    },
    [brandKey, selectedStoreCodes, selectedDays, selectedSubCategories, selectedTargets, appliedQuery, activeAgeMonths, center.lat, center.lng, radiusKm]
  );

  useEffect(() => {
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
  }, [brandKey, selectedStoreCodes, selectedDays, selectedSubCategories, selectedTargets, appliedQuery, activeAgeMonths, center.lat, center.lng, radiusKm]);

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
  const hasActiveFilters =
    selectedDays.size > 0 || selectedSubCategories.size > 0 || selectedTargets.size > 0 || selectedStoreCodes.size > 0 || appliedQuery !== '';

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
    setSelectedStoreCodes(new Set());
    setSearchDraft('');
    setAppliedQuery('');
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedQuery(searchDraft.trim());
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        <div className="flex flex-col gap-2 pb-2 border-b border-gray-100">
          {/* [1차 조건 — 아이 연령] 사용자가 고르는 게 아니라 늘 깔려 있는 기본값이라
              브랜드/요일 pill보다 위, 검색창보다도 위에 둔다. */}
          <ChildAgeBanner children={children} activeIndex={activeChildIndex} onSwitch={setActiveChildIndex} />

          {/* [Branch-First 반경 선택] "거리 선택 필터 컴포넌트의 위치는 검색창
              위쪽에 위치하도록" — 검색창보다 위, 아이 연령 배너 바로 아래에 둔다.
              이 반경은 지점(Branch)을 먼저 좁히는 기준이라 브랜드와 무관하게
              항상 보인다. */}
          <div className="flex items-center gap-1.5 px-3 pt-1">
            <span className="shrink-0 text-xs text-gray-400">반경</span>
            {RADIUS_KM_OPTIONS.map((km) => (
              <button
                key={km}
                type="button"
                aria-pressed={radiusKm === km}
                onClick={() => setRadiusKm(km)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  radiusKm === km ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {km}km
              </button>
            ))}
          </div>

          {/* [검색창] "트니트니 입력하고 조회버튼 누르면 검색" — 입력할 때마다 바로
              검색하지 않고 제출(조회) 시에만 적용한다. */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2 px-3 pt-1">
            <input
              type="text"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="강좌명 검색 (예: 트니트니)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white">
              조회
            </button>
          </form>

          {/* 브랜드 필터 — 전체(기본)/이마트/롯데마트. */}
          <div className="flex items-center gap-2 px-3 pt-1">
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
            <div className="flex items-center justify-end px-3">
              <button type="button" onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600">
                ↻ 초기화
              </button>
            </div>
          )}

          {/* [계층형 지점 선택 — 2단계, 다중선택](2026-10-07 todo.md 개선사항1-3):
              "전체 지점이 나오는 게 아니라 반경 내로 필터링된 지점들만 뱃지
              형태로... 다중 선택이 가능하도록... 아무 지점도 선택하지 않았을
              때는 전체 지점 선택과 동일" — "전체"일 땐 지점 네임스페이스가
              브랜드마다 달라 숨긴다. */}
          {brandKey !== 'all' && (
            <div className="flex flex-wrap gap-1.5 px-3">
              {stores.length === 0 && <span className="text-xs text-gray-400">반경 {radiusKm}km 내 지점이 없어요</span>}
              {stores.map((store) => {
                const isActive = selectedStoreCodes.has(store.storeCode);
                const distanceLabel = formatDistanceLabel(store.distanceMeters);
                return (
                  <button
                    key={store.storeCode}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setSelectedStoreCodes((prev) => toggleInSet(prev, store.storeCode))}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {store.label}
                    {distanceLabel ? ` · ${distanceLabel}` : ''}
                  </button>
                );
              })}
            </div>
          )}

          {/* 요일 필터 — 다중선택 OR, 모든 브랜드 공통. */}
          <div className="flex gap-1.5 overflow-x-auto px-3">
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
            <div className="flex gap-1.5 overflow-x-auto px-3 pb-1">
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
            <div className="flex gap-1.5 overflow-x-auto px-3 pb-1">
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
            <div className="flex flex-col gap-2">
              {items.map((item, index) =>
                (index + 1) % AD_SLOT_INTERVAL === 0 ? (
                  <div key={item.id} className="contents">
                    <CultureClubAdSlot />
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
