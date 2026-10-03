'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/map/empty-state';
import { EventListSkeleton } from '@/components/cards/event-list-skeleton';
import { BookmarkButton } from '@/components/community/bookmark-button';
import {
  buildCultureClubThumbnailUrl,
  CULTURE_CLUB_BRAND_OPTIONS,
  CULTURE_CLUB_DAY_OPTIONS,
  CULTURE_CLUB_SUB_CATEGORY_OPTIONS,
  CultureClubDay,
  CultureClubSubCategory,
} from '@/lib/home/culture-club-options';

// [탭 구조 재수정](2026-10-03 사용자 지시): "이벤트픽 화면에서 현재꺼에 대하여 탭으로
// 하나있고 문화센터로 탭하나 만들자는 얘기였는데" — 처음엔 중분류 그리드 아래 버튼을
// 눌러 여는 바텀시트(culture-club-sheet.tsx)로 만들었는데, 그게 아니라 이벤트픽
// 화면 자체를 "이벤트"/"문화센터" 2개 탭으로 나누고 싶다는 뜻이었다. 바텀시트
// 오버레이(fixed inset-0, 배경 클릭으로 닫기)를 전부 제거하고, home-view.tsx의 탭
// 전환으로 이 화면 전체가 바로 렌더링되는 평범한 인라인 컴포넌트로 바꿨다.
//
// [카드/레이아웃 재설계](2026-10-03 사용자 지시, 이마트 컬처클럽 실제 PC 화면 캡처
// `reference/emart culture club.png` 참고): "스크롤내리면 위에 검색조건도 같이 위로
// 딸려올라가고" — 필터 영역을 shrink-0으로 고정하지 않고, 필터+리스트를 하나의
// 스크롤 컨테이너로 합쳤다(무한스크롤 트리거도 이 컨테이너 기준). 카드는 참고
// 화면처럼 이미지(좌상단에 상태 뱃지) + 텍스트 영역(소분류·정원 / 제목(2줄 말줄임)
// / 가격(+재료비)·찜 아이콘 / 구분선 / 접수기간 / 일정) 구조로 바꿨고, "지점"은 이미
// 상단에서 선택돼 고정이라 카드에는 넣지 않는다(사용자 지시: "우리는 지점은
// 고정이니 굳이 지점 나올필요없고"). 그리드는 PC 4열 참고화면과 달리 모바일 우선
// 앱이라 2열(md 이상에서 4열)로 뒀다.
const PAGE_SIZE = 20;
// [광고 자리 스캐폴딩](2026-10-03 사용자 지시): "5번째 혹은 10번째 카드마다 ... 스폰서드/
// 추천 상품 카드 자리 기능적으로 마련" — 실제 광고 콘텐츠/스폰서 테이블은 이번 범위가
// 아니다(제5장 제7조 — 확장 구조는 허용, 확장 기능 자체는 구현하지 않음). 자리만 끼워
// 두고 CultureClubAdSlot은 아직 null을 반환한다.
const AD_SLOT_INTERVAL = 10;
// [클래스 신청하러 가기 — 딥링크 확인됨](2026-10-03 사용자 제공 URL로 실측 확인):
// "https://www.cultureclub.emart.com/class/{classId}" 형태로 강좌별 상세 페이지에
// 바로 연결된다. curl로 직접 확인(브라우저 User-Agent 없이는 /enrolment 베이스
// 페이지도 403이 나는 동일한 사이트 전역 봇 차단 때문이었고, User-Agent를 붙이면
// /class/{classId}가 200을 반환함을 확인) — 이전엔 패턴을 몰라 검색 화면(/enrolment)
// 으로만 보냈었다.
function buildEmartClassUrl(classId: string) {
  return `https://www.cultureclub.emart.com/class/${classId}`;
}

type StoreOption = { storeCode: string; label: string };

type CultureClubClass = {
  class_id: string;
  class_title: string;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  sub_category_name: string | null;
  class_fee: number | null;
  class_material_fee: number | null;
  class_capacity: number | null;
  filter_status: '접수대기' | '접수중' | '정원마감';
  register_start_date: string | null;
  register_end_date: string | null;
  main_image_key: string | null;
  collected_at: string;
  store_name: string | null;
  class_detail_title: string | null;
  class_detail_content: string | null;
};

function formatTimeRange(start: string | null, end: string | null) {
  const fmt = (t: string | null) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t ?? '-');
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function formatDateCompact(raw: string | null) {
  if (!raw || raw.length !== 8) return raw ?? '-';
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

// [접수 시작 시각 표시](2026-10-03): register_start_date 원본("YYYYMMDDHHmm", 12자,
// KST — 오늘 앞서 register_start_at 컬럼을 추가한 바로 그 필드)에 실제 시각이 있어
// 날짜만 보여주면 "예약 시작 시각"이라는 중요 정보가 빠진다. 12자가 아니면(실측상
// 항상 12자지만 방어적으로) 날짜만 보여준다.
function formatRegisterStart(raw: string | null) {
  if (!raw || raw.length !== 12) return formatDateCompact(raw);
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}`;
}

// [데이터 신선도 안내](2026-10-03 사용자 지적): "우린 하루에 한번 가져오는데 .. 접수중
// 이거 보여줘도 되려나? 이게 하루에 한번 업데이트되니 사람들이 좀 착각할거같은데" —
// 상태(접수중/정원마감 등)가 실시간이 아니라 일 1회 배치 갱신임을 숨기지 않고 그대로
// 보여준다(제3장 추측 금지 — 실시간인 척하지 않음, 제6장 제2조 사용자 경험). 새 쿼리를
// 추가하지 않고 이미 응답에 포함된 각 행의 collected_at(배치가 실제로 수집한 시각)을
// 그대로 쓴다 — 같은 배치 실행에서 수집됐으므로 지점 내 모든 행이 사실상 동일한 값이다.
function formatUpdatedAt(raw: string) {
  const date = new Date(raw);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}.${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusLabel(status: CultureClubClass['filter_status']) {
  return status === '정원마감' ? '대기접수 가능' : status;
}

function statusBadgeClassName(status: CultureClubClass['filter_status']) {
  if (status === '정원마감') return 'bg-amber-500 text-white';
  if (status === '접수중') return 'bg-emerald-600 text-white';
  return 'bg-gray-700 text-white';
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

// [이미지 — 썸네일 CDN 확인됨](2026-10-03 사용자 제공 URL로 실측 확인): main_image_bucket
// 직접 접근(S3)은 여전히 403이지만, 사용자가 실제 사이트에서 뜨는 이미지의 실제 요청
// URL(`https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/{main_image_key}`)을
// 찾아줘서 공개 CDN으로 접근 가능함을 확인했다(buildCultureClubThumbnailUrl 참고).
// 상세(큰) 해상도 경로는 아직 못 찾았다 — 상세보기 자체도 이번 범위에 없어 지금은
// 리스트 썸네일만 적용한다. main_image_key가 없는 행(드묾, 상세 백필 전 상태 등)은
// 플레이스홀더로 폴백한다.
function ClassImage({ imageKey, status }: { imageKey: string | null; status: CultureClubClass['filter_status'] }) {
  const thumbnailUrl = buildCultureClubThumbnailUrl(imageKey);
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-t-xl bg-gray-100">
      <span className={`absolute left-2 top-2 z-10 rounded px-1.5 py-0.5 text-[11px] font-semibold ${statusBadgeClassName(status)}`}>
        {statusLabel(status)}
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
  return (
    // [상세보기 — 클릭 반응 없음 수정](2026-10-03 사용자 지적): "왜 눌렀을때 반응이
    // 없어? 누르면 상세페이지가 바텀시트로 나와야 하는거 아니야?" — 카드 전체를
    // 클릭 가능하게 하되, 찜 버튼 클릭은 별도로 막아(아래 stopPropagation) 상세
    // 시트가 함께 열리지 않게 한다. 카드 안에 찜 버튼(<button>)이 중첩되므로
    // 카드 자체는 <button>이 아니라 role="button"인 <div>로 둔다(버튼 중첩은
    // 유효한 HTML이 아님).
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(item);
      }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left"
    >
      <ClassImage imageKey={item.main_image_key} status={item.filter_status} />
      <div className="flex flex-col gap-1 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">{item.sub_category_name ?? '-'}</span>
          {item.class_capacity != null && <span className="text-[11px] text-gray-400">정원 {item.class_capacity}명</span>}
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
          {/* [찜 아이콘 — 연결됨](2026-10-03 사용자 지시: "찜/알람은 같은 기능이니깐
              두 테이블 데이터 전부 참조할 수 있도록 확장") user_bookmarks가
              emart_class_id로 확장돼 스팟/이벤트와 동일한 BookmarkButton을 그대로
              쓴다(열심맘 이상 노출, 우수맘 이상은 예약 알람 20개 캡 대상에도 합산). */}
          <span onClick={(e) => e.stopPropagation()}>
            <BookmarkButton target={{ kind: 'emart_class', emartClassId: item.class_id }} />
          </span>
        </div>
        <hr className="my-0.5 border-gray-100" />
        <p className="text-[11px] text-gray-400">
          접수기간 {formatRegisterStart(item.register_start_date)} ~ {formatDateCompact(item.register_end_date)}
        </p>
        <p className="text-[11px] text-gray-400">
          일정 {(item.class_day ?? []).join(',')} {formatTimeRange(item.start_time, item.end_time)}
        </p>
      </div>
    </div>
  );
}

// [클래스 상세 바텀시트](2026-10-03 사용자 지시, `reference/emart culture club
// detail.png` 참고): "이미지 똑같은게 좀더 크게 좌측에 보이고 오른쪽도 목록
// 리스트에 있는게 좀더 크게 보이는 구조" — 이미지(좌, 모바일에선 위) + 정보(우,
// 모바일에선 아래) 2분할, 액션 2개(찜 = 참고 화면의 "클래스 담기"에 대응, "클래스
// 신청하러 가기" = "클래스 신청하기"에 대응하되 실제 신청은 이마트 사이트에서
// 처리하므로 외부 링크), 그 아래 "클래스소개"(실제로 수집된 class_detail_content)
// 접이식 섹션. "강사정보"/"FAQ"는 참고 화면에 있지만 우리가 아직 그 데이터를
// 수집하지 않아(현재 GraphQL 쿼리는 classDetail.classDetailInfo만 가져옴) 이번
// 범위에서 제외했다 — 실제 쿼리를 확인하면 추가한다(추측으로 필드를 지어내지 않음,
// 제3장 제5조).
function CultureClubDetailSheet({ item, onClose }: { item: CultureClubClass; onClose: () => void }) {
  const [isIntroOpen, setIsIntroOpen] = useState(true);
  const hasMaterialFee = item.class_material_fee != null && item.class_material_fee > 0;
  const thumbnailUrl = buildCultureClubThumbnailUrl(item.main_image_key);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[720px] max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-base font-bold text-gray-900">클래스 상세</span>
          <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 p-4">
          <div className="relative aspect-square w-full md:w-1/2 overflow-hidden rounded-xl bg-gray-100 shrink-0">
            <span
              className={`absolute left-2 top-2 z-10 rounded px-1.5 py-0.5 text-[11px] font-semibold ${statusBadgeClassName(item.filter_status)}`}
            >
              {statusLabel(item.filter_status)}
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
            <span className="text-xs text-gray-400">{item.sub_category_name ?? '-'}</span>
            <h2 className="text-lg font-bold text-gray-900">{item.class_title}</h2>
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
              일정 {(item.class_day ?? []).join(',')} {formatTimeRange(item.start_time, item.end_time)}
            </p>
            <p className="text-sm text-gray-500">
              접수기간 {formatRegisterStart(item.register_start_date)} ~ {formatDateCompact(item.register_end_date)}
            </p>
            {item.store_name && <p className="text-sm text-gray-500">접수가능지점 {item.store_name}</p>}
            {item.class_capacity != null && <p className="text-sm text-gray-500">정원 {item.class_capacity}명</p>}

            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2">
                <BookmarkButton target={{ kind: 'emart_class', emartClassId: item.class_id }} />
              </div>
              <a
                href={buildEmartClassUrl(item.class_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-orange-600"
              >
                클래스 신청하러 가기 ↗
              </a>
            </div>
          </div>
        </div>

        {item.class_detail_content && (
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
                {item.class_detail_title && <p className="mb-1 font-medium text-gray-800">{item.class_detail_title}</p>}
                {item.class_detail_content}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CultureClubTabView() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeCode, setStoreCode] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<Set<CultureClubDay>>(new Set());
  const [selectedSubCategories, setSelectedSubCategories] = useState<Set<CultureClubSubCategory>>(new Set());
  const [items, setItems] = useState<CultureClubClass[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CultureClubClass | null>(null);

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

  // 지점/요일/카테고리 필터가 바뀌면 항상 1페이지부터 새로 조회한다.
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

  // [필터+리스트 단일 스크롤](2026-10-03 사용자 지시): "스크롤내리면 위에 검색조건도
  // 같이 위로 딸려올라가고" — 필터 영역을 더 이상 shrink-0으로 고정하지 않고, 이
  // 컨테이너 하나가 전체(필터+리스트)를 스크롤한다. 무한스크롤도 이 컨테이너 기준.
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
    <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
      <div className="flex flex-col gap-2 p-3 border-b border-gray-100">
        {/* 브랜드 세그먼트 — 지금은 1개뿐이라 선택 UI라기보다 라벨 표시. */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {CULTURE_CLUB_BRAND_OPTIONS.map((brand) => (
              <span key={brand.key} className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
                {brand.label}
              </span>
            ))}
          </div>
          {(selectedDays.size > 0 || selectedSubCategories.size > 0) && (
            <button type="button" onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600">
              ↻ 초기화
            </button>
          )}
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

      <div className="p-3">
        {isLoading && items.length === 0 && <EventListSkeleton label="문화센터 강좌 불러오는 중" />}
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {isEmpty && <EmptyState onReset={resetFilters} />}
        {items.length > 0 && (
          <p className="mb-2 text-[11px] text-gray-400">
            ⏱ 마지막 업데이트 {formatUpdatedAt(items[0].collected_at)} · 접수 상태는 하루 1회 갱신돼요
          </p>
        )}
        {items.length > 0 && (
          // [그리드 반응형](2026-10-03 사용자 지시): "캡쳐한게 pc기준으로해서 이벤트
          // 카드가 4개가 1row로 되어있는데... 모바일에선 2개정도가 한계이지 않을까?" —
          // 모바일 2열, md 이상(태블릿/PC)에서 참고 화면과 동일하게 4열.
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {items.map((item, index) =>
              (index + 1) % AD_SLOT_INTERVAL === 0 ? (
                <div key={item.class_id} className="contents">
                  <div className="col-span-full">
                    <CultureClubAdSlot />
                  </div>
                  <ClassCard item={item} onSelect={setSelectedItem} />
                </div>
              ) : (
                <ClassCard key={item.class_id} item={item} onSelect={setSelectedItem} />
              )
            )}
          </div>
        )}
        {isLoading && items.length > 0 && <p className="mt-4 text-center text-xs text-gray-400">불러오는 중...</p>}
      </div>
      {selectedItem && <CultureClubDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
