'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/map/empty-state';
import { EventListSkeleton } from '@/components/cards/event-list-skeleton';
import { MapPreviewModal } from '@/components/map/map-preview-modal';
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
  buildAkplazaDetailUrl,
  buildStarfieldDetailUrl,
  buildLotteDepartmentDetailUrl,
  buildElandRetailDetailUrl,
  STARFIELD_STORE_EN_NAME_BY_CODE,
  buildLottemartCourseViewUrl,
  buildShinsegaeDetailUrl,
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
// 값 구성을 그대로 따랐었다(제5장 제4조 기존 구조 우선).
// [20km 옵션 제거](2026-10-09 사용자 지시: "20km는 너무 먼거같고 필요없어보여")
// 문화센터는 지점을 오가는 생활권 거리가 중요해 20km는 과하다고 판단 —
// 이 화면(문화센터)에만 적용, map-explorer.tsx의 반경 선택은 별개 범위라
// 건드리지 않는다.
const RADIUS_KM_OPTIONS = [5, 10] as const;
const DEFAULT_RADIUS_KM = 10;

// [지점 뱃지 드릴다운 — 6개 브랜드 추가](2026-10-09 사용자 지시: "신세계
// 브랜드 선택시 데이터는 나오는데 그 상세지점 왜안나와 ?" → "6개 브랜드
// 전부 지금 추가") 2026-10-08 Decision 029 범위에서 이마트/롯데마트
// 2개만 지점 선택 UI를 연결하고 나머지 6개는 "API는 만들어뒀지만 화면
// 연결은 나중에"로 미뤄뒀었는데, 관리자 패널(culture-club-panel.tsx)이
// 이미 6개 브랜드 전용 지점 목록 API(hyundai-stores/shinsegae-stores/
// akplaza-stores/starfield-stores/lotte-department-stores/eland-
// retail-stores)를 쓰고 있어 그대로 재사용한다(제5장 제4조 기존 구조
// 우선) — 새 API를 만들 필요 없이 이 화면에서도 brandKey별로 맞는
// 엔드포인트만 연결하면 된다.
const STORE_ENDPOINT_BY_BRAND: Record<Exclude<CultureClubBrandKey, 'all'>, string> = {
  emart: '/api/culture-club/stores',
  lottemart: '/api/culture-club/lottemart-stores',
  hyundai: '/api/culture-club/hyundai-stores',
  shinsegae: '/api/culture-club/shinsegae-stores',
  ak_plaza: '/api/culture-club/akplaza-stores',
  starfield: '/api/culture-club/starfield-stores',
  lotte_department: '/api/culture-club/lotte-department-stores',
  eland_retail: '/api/culture-club/eland-retail-stores',
};
// [코어 데이터 캐싱 — 기본 풀 크기](2026-10-08 todo.md 개선사항1) route.ts의
// DISTANCE_SORT_FETCH_SAFETY_CEILING(거리순 정렬 시 안전 상한)과 동일한
// 값으로 요청해, 그 반경·연령 조건의 전체 풀을 한 번에 받아 캐싱한다.
const BASE_POOL_SIZE = 5000;

function buildEmartClassUrl(sourceClassId: string) {
  return `https://www.cultureclub.emart.com/class/${sourceClassId}`;
}

// [현대백화점 — 실측 확인](2026-10-08) 상세 페이지 링크는 stCd(지점)/
// sqCd/crsSqNo(=source_class_id)/crsCd/proCustNo 5개 파라미터가 필요하다
// — sqCd/crsCd/proCustNo는 공통 컬럼이 아니라 raw_extra에 있다.
function buildHyundaiCourseViewUrl(params: { storeCode: string; classId: string; sqCd: string; crsCd: string; proCustNo: string }) {
  const query = new URLSearchParams({
    stCd: params.storeCode,
    sqCd: params.sqCd,
    crsSqNo: params.classId,
    crsCd: params.crsCd,
    proCustNo: params.proCustNo,
    ctGubn: '',
  });
  return `https://www.ehyundai.com/newCulture/CT/CT010100_V.do?${query.toString()}`;
}

// 브랜드마다 "신청하러 가기" 외부 링크를 만드는 방식이 다르다(이마트는
// class_id만, 롯데마트는 store_code+semester_code+target_code도 필요,
// 현대백화점은 store_code+sqCd+crsCd+proCustNo도 필요 — 뒤쪽 추가 파라미터
// 들은 공통 컬럼이 아니라 raw_extra에 있다) — 여기서만 분기한다.
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
  if (item.brand === 'hyundai' && item.store_code) {
    const sqCd = item.raw_extra.sq_cd;
    const crsCd = item.raw_extra.crs_cd;
    const proCustNo = item.raw_extra.pro_cust_no;
    if (typeof sqCd === 'string' && typeof crsCd === 'string' && typeof proCustNo === 'string') {
      return buildHyundaiCourseViewUrl({ storeCode: item.store_code, classId: item.source_class_id, sqCd, crsCd, proCustNo });
    }
  }
  if (item.brand === 'shinsegae' && item.store_code) {
    const yearCode = item.raw_extra.year_code;
    const semesterCode = item.raw_extra.semester_code;
    if (typeof yearCode === 'string' && typeof semesterCode === 'string') {
      return buildShinsegaeDetailUrl({ yearCode, semesterCode, storeCode: item.store_code, classId: item.source_class_id });
    }
  }
  if (item.brand === 'ak_plaza' && item.store_code) {
    const mainCd = item.raw_extra.main_cd;
    if (typeof mainCd === 'string') {
      return buildAkplazaDetailUrl({ storeCode: item.store_code, mainCd, classId: item.source_class_id });
    }
  }
  if (item.brand === 'starfield' && item.store_code) {
    const storeEnNm = STARFIELD_STORE_EN_NAME_BY_CODE[item.store_code];
    if (storeEnNm) {
      return buildStarfieldDetailUrl({ storeEnNm, classId: item.source_class_id });
    }
  }
  if (item.brand === 'lotte_department') {
    return buildLotteDepartmentDetailUrl(item.source_class_id);
  }
  if (item.brand === 'eland_retail') {
    return buildElandRetailDetailUrl(item.source_class_id);
  }
  return null;
}

// 찜 기능은 아직 브랜드별 kind(emart_class/lottemart_class)를 쓴다 —
// bookmarks.ts가 내부적으로 culture_club_classes.id로 변환해주므로 이 화면은
// 기존 호출 방식을 그대로 재사용한다(2026-10-06 찜 FK 통합, Decision 028).
// [현대백화점 — 찜 아직 미지원](2026-10-08, Decision 029) BookmarkTarget
// 유니온에 'hyundai_class'가 아직 없다 — 브랜드가 늘어날 때마다 bookmarks.ts/
// MyBookmark/getMyBookmarkedIds를 전부 같이 늘리는 구조적 비용은 Decision
// 028이 이미 "조회는 통합, 쓰기는 당장 미룸"으로 의도적으로 남겨둔 부분이라,
// 이번 범위(데이터 수집)를 넘어서는 결정을 임의로 추가하지 않는다(제5장
// 제3조). null을 돌려주고 호출부가 찜 버튼 자체를 생략한다.
function toBookmarkTarget(item: CultureClubClass): BookmarkTarget | null {
  if (item.brand === 'emart') return { kind: 'emart_class', emartClassId: item.source_class_id };
  if (item.brand === 'lottemart') return { kind: 'lottemart_class', lottemartClassId: item.source_class_id };
  return null;
}

type StoreOption = { storeCode: string; label: string; distanceMeters?: number | null };

type CultureClubClass = {
  id: number;
  brand: 'emart' | 'lottemart' | 'hyundai' | 'shinsegae' | 'ak_plaza' | 'starfield' | 'lotte_department' | 'eland_retail';
  source_class_id: string;
  class_title: string;
  store_code: string | null;
  store_name: string | null;
  sub_category_name: string | null;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  class_fee: number | null;
  class_material_fee: number | null;
  instructor_name: string | null;
  min_age_months: number | null;
  max_age_months: number | null;
  schedule_start_date: string | null;
  schedule_end_date: string | null;
  total_sessions: number | null;
  normalized_status: 'OPEN' | 'CLOSED' | 'WAITING';
  raw_status: string | null;
  register_start_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_extra: Record<string, any>;
  collected_at: string;
  // [위치 기반 정렬](2026-10-07) — lat/lng 파라미터가 있을 때만 API가 채워준다.
  distance_meters?: number | null;
  // [위치 팝업용 좌표](2026-10-07) — lat/lng 파라미터가 있을 때만 채워진다.
  store_lat?: number | null;
  store_lng?: number | null;
};

// [브랜드 라벨 — "문화센터"류 접미사 제거](2026-10-09 사용자 지시, culture-
// club-options.ts의 CULTURE_CLUB_BRAND_OPTIONS와 동일한 이유) 강좌 상세
// 시트 제목("OOO 강좌 상세")과 위치 줄에 쓰는 브랜드명도 순수 브랜드명만
// 쓴다 — 필터 pill과 다른 라벨을 쓰면 오히려 헷갈린다.
const BRAND_LABELS: Record<CultureClubClass['brand'], string> = {
  emart: '이마트',
  lottemart: '롯데마트',
  hyundai: '현대백화점',
  shinsegae: '신세계',
  ak_plaza: 'AK플라자',
  starfield: '스타필드',
  lotte_department: '롯데백화점',
  eland_retail: '이랜드리테일',
};

// [위치 줄 — 지점명에 브랜드 접두사](2026-10-09 사용자 지적: "각 목록
// 리스트에 원래는 이마트 분당점 이렇게 나왔는데 그냥 분당 2.4km 이렇게만
// 나오네") culture_club_classes.store_name은 원본 사이트 표기 그대로라
// 브랜드 없이 "분당"/"수원"처럼 짧게만 들어있는 브랜드가 많다(이마트/
// AK플라자/스타필드/롯데백화점/이랜드리테일) — 카드에 브랜드 뱃지가 없는
// 지금 구조에선 "분당"만 보면 어느 브랜드인지 알 수 없다. 목록 카드에선
// 브랜드명을 붙여 "이마트 분당"처럼 보여준다.
function formatStoreNameWithBrand(item: CultureClubClass): string | null {
  if (!item.store_name) return null;
  return `${BRAND_LABELS[item.brand]} ${item.store_name}`;
}

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

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 'YYYY-MM-DD' 문자열을 로컬 타임존 기준 Date로 안전하게 파싱한다 — new
// Date(문자열)은 UTC로 해석해 타임존에 따라 하루 밀릴 수 있다.
function parseDateOnly(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

type DateParts = { year: number; month: number; day: number; weekday: number };

// [타임존 안전 처리 — KST 고정](2026-10-07 실측으로 발견) register_start_at은
// "+09:00"까지 포함한 완전한 타임스탬프라 new Date(iso)로 파싱하면 그 자체는
// 맞지만, 이어서 .getMonth()/.getDate()를 부르면 "실행 중인 서버/브라우저의
// 로컬 타임존"을 기준으로 날짜를 읽어버려(KST가 아니면) 날짜가 하루 밀릴 수
// 있다(실측 — 테스트 환경 타임존에서 하루 어긋나는 걸 직접 확인). 이 앱은
// 한국 사용자 전용이라 실행 환경 타임존과 무관하게 항상 KST로 날짜를
// 읽도록 UTC epoch에 9시간을 더해 UTC getter로 읽는다(DST 없는 KST라
// 안전하게 고정 오프셋으로 계산 가능).
function kstDatePartsFromIso(isoString: string): DateParts {
  const kst = new Date(new Date(isoString).getTime() + 9 * 60 * 60 * 1000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate(), weekday: kst.getUTCDay() };
}

// "YYYYMMDD"(8자)는 시각/타임존 정보가 전혀 없는 순수 날짜라 위 KST 보정이
// 필요 없다 — 그대로 잘라서 읽는다.
function datePartsFromYyyymmdd(raw: string | null | undefined): DateParts | null {
  if (!raw || raw.length !== 8) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  return { year, month, day, weekday: new Date(year, month - 1, day).getDay() };
}

function formatDateParts(parts: DateParts): string {
  return `${parts.month}.${parts.day}(${KOREAN_WEEKDAYS[parts.weekday]})`;
}

function isSameDateParts(a: DateParts, b: DateParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

// [시간 표기 — 타이트하게](2026-10-07 사용자 지시: "11:00-12:20"처럼) 날짜
// 범위는 "~"를 쓰고 시간은 "-"로 붙여 서로 구분되게 한다.
function formatTimeRangeTight(start: string | null, end: string | null): string {
  const fmt = (t: string | null) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t ?? '-');
  return `${fmt(start)}-${fmt(end)}`;
}

// [수업 일정 — "9.2~11.4 매주 수요일 11:00-12:20"](2026-10-07 사용자 지시)
// 시작~종료일이 같으면("단발성" 강좌) 범위 표기 없이 날짜 하나만 보여준다.
function formatClassScheduleLabel(item: CultureClubClass): string {
  const start = parseDateOnly(item.schedule_start_date);
  const end = parseDateOnly(item.schedule_end_date);
  const days = item.class_day ?? [];

  const parts: string[] = [];
  if (start && end && !isSameLocalDate(start, end)) {
    parts.push(`${formatMonthDay(start)}~${formatMonthDay(end)}`);
  } else if (start) {
    parts.push(formatMonthDay(start));
  }
  if (days.length > 0) parts.push(`매주 ${days.join(',')}요일`);
  parts.push(formatTimeRangeTight(item.start_time, item.end_time));
  return parts.join(' ');
}

// [접수 일정 — "7.24(금)" 또는 "7.22(수) ~ 11.24(화)"](2026-10-07 사용자
// 지시: "접수 일자만 보여주고 시간은 보여주지마.. 시간은 내부적으로 쓸꺼야")
// register_start_at엔 시각까지 있지만(접수 시작 알림 기능이 내부적으로 그
// 시각을 그대로 쓴다 — CultureClubReservationHint 참고) 이 줄엔 날짜만
// 보여준다. 데이터가 전혀 없으면(롯데마트 등) null을 돌려주고, 호출부가
// "상세 페이지에서 확인" 문구로 대체한다(추측해서 날짜를 만들어내지 않음).
function formatRegistrationDateLabel(item: CultureClubClass): string | null {
  if (!item.register_start_at) return null;
  const start = kstDatePartsFromIso(item.register_start_at);
  const end = datePartsFromYyyymmdd(item.raw_extra.register_end_date as string | null | undefined);

  const startLabel = formatDateParts(start);
  if (!end || isSameDateParts(start, end)) return startLabel;
  return `${startLabel} ~ ${formatDateParts(end)}`;
}

// [데이터 신선도 안내] 상태가 일 1회 배치 갱신임을 숨기지 않고 그대로 보여준다
// (이전 두 화면의 동일 패턴 유지, 제3장 제5조 — 실시간인 척하지 않음).
// [시간 제거 — 일자만](2026-10-09 사용자 지적: "이거 각각의 브랜드마다
// 다르잖아... 마지막 업데이트는 시간은 빼... 일자만 넣어") 보여주는 값은
// 화면에 뜬 첫 강좌 1건의 collected_at일 뿐인데, 브랜드마다 배치 시각이
// 달라(일일 배치 vs 롯데백화점 4~6시간 랜덤 주기 등) 분 단위 시각까지
// 보여주면 "전체가 그 시각에 갱신됐다"는 오해를 줄 수 있다 — 일자만
// 보여주는 거친 단위로 낮춰 그 오해를 줄인다.
function formatUpdatedAt(raw: string) {
  const date = new Date(raw);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

// [위치 클릭 → 인앱 지도 팝업](2026-10-07 사용자 지시: "스타필드시티위례..
// 링크걸어놔서 누르면 위치 뜨도록해줘.. 지도 인앱? 팝업으로?") 스팟/이벤트
// 상세에서 이미 쓰고 있는 MapPreviewModal(인앱 지도 + 길찾기)을 그대로
// 재사용한다(제5장 제4조 — 새로 만들지 않음). 지점 좌표(store_lat/lng)가
// 없는 경우(위치 파라미터 없이 호출된 드문 경로)는 클릭 가능하게 만들 수
// 없으니 평범한 텍스트로 둔다(추측으로 좌표를 지어내지 않음).
function LocationLink({ item, label }: { item: CultureClubClass; label: string }) {
  const [showMap, setShowMap] = useState(false);
  const hasCoords = item.store_lat != null && item.store_lng != null;

  if (!hasCoords) return <span className="truncate">{label}</span>;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowMap(true);
        }}
        className="truncate text-left text-sky-600 hover:underline"
      >
        {label}
      </button>
      {showMap && (
        <MapPreviewModal lat={item.store_lat!} lng={item.store_lng!} name={item.store_name ?? '문화센터'} onClose={() => setShowMap(false)} />
      )}
    </>
  );
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

// [썸네일 — 롯데마트도 상세수집으로 채워짐](2026-10-07 사용자 지적: "이거
// 관련해서 왜 이미지가 없지? ... 여기 가니깐 이미지 있는데?") — 이마트는
// bucket/region/key를 CDN URL로 조합해야 하지만(buildCultureClubThumbnailUrl),
// 롯데마트는 lottemart-culture-club-detail.mjs가 이미 완전한 절대 URL을
// raw_extra.main_image_url에 채워주므로 그대로 쓴다.
function getThumbnailUrl(item: CultureClubClass): string | null {
  if (item.brand === 'emart') {
    return buildCultureClubThumbnailUrl(item.raw_extra.main_image_key as string | null | undefined);
  }
  return (item.raw_extra.main_image_url as string | null | undefined) ?? null;
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
  // [이미지 — 두 브랜드 다 상세수집으로 채워짐, 실측 확인] 목록 API 응답에는
  // 썸네일이 없지만(두 브랜드 다 공통), 상세 페이지(class-detail 배치)가
  // class_id당 한 번씩 조회해 채워둔다 — getThumbnailUrl() 참고. 그래도
  // 상세수집이 아직 못 돈 강좌는 플레이스홀더로 보이는 게 정상 동작이다.
  // [픽셀 비율 — 실측 확인](2026-10-07 사용자 지적: "픽셀 맞춘거 맞아?") 실제
  // 원본 이미지가 정사각형이 아니라 가로형(약 3:2)이라 정사각형(96×96)
  // 박스에 넣으면 과도하게 크롭됐다 — 가로로 조금 더 넓은 박스(112×96)로
  // 바꿔 크롭을 줄인다.
  const thumbnailUrl = getThumbnailUrl(item);
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
  const scheduleLabel = formatClassScheduleLabel(item);
  // [접수일자 — 날짜만](2026-10-07 사용자 지시: "접수 일자만 보여주고 시간은
  // 보여주지마.. 시간은 내부적으로 쓸꺼야") 데이터가 없으면(롯데마트 등)
  // "상세 페이지에서 확인"으로 안내한다(추측해서 날짜를 만들어내지 않음).
  const registrationLabel = formatRegistrationDateLabel(item);
  const bookmarkTarget = toBookmarkTarget(item);

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
          <p className="line-clamp-2 flex-1 text-sm font-medium text-slate-900">{item.class_title}</p>
          {bookmarkTarget && (
            <span onClick={(e) => e.stopPropagation()} className="-mt-1 shrink-0">
              <BookmarkButton target={bookmarkTarget} />
            </span>
          )}
        </div>
        {/* [브랜드 뱃지 제거](2026-10-07 사용자 지적: "롯데몰수지점 8.5km
            되어있는데 롯데마트 뱃지가 위에 안나와도 되지 않나?") — 아래
            위치 줄(📍 지점명 · 거리)이 이미 브랜드/위치를 전달해 중복이었다.
            할인/마감임박/신설처럼 실제로 다른 정보를 주는 뱃지만 남긴다.
            [카테고리/연령도 뱃지로](2026-10-07 사용자 지적: "Kids & Children
            (event)라던가 4세~5세 연령... 제목 아래 있는것들 눈에 잘 안띄네..
            뱃지처럼 만들어주던가") — 기존엔 흐린 회색 텍스트 한 줄이라
            눈에 잘 안 띄었다. 할인/마감임박/신설과 같은 줄에 뱃지로 합쳐
            한 번에 보여준다(여백도 줄어드는 효과). */}
        <div className="flex flex-wrap items-center gap-1">
          {item.sub_category_name && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{item.sub_category_name}</span>
          )}
          {ageLabel && <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{ageLabel}</span>}
          {discountBadge && <span className="shrink-0 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{discountBadge}</span>}
          {isClosingSoon && <span className="shrink-0 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">마감임박</span>}
          {isNew && <span className="shrink-0 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">신설</span>}
        </div>
        {/* [회차 표시 추가](2026-10-07 사용자 지적: "가격 관련 몇회 몇만원
            아니었어? 몇회가 안보여 상세 들어가야 보여") — total_sessions를
            가격 옆에 바로 보여준다. */}
        <p className="flex items-baseline gap-1 text-base font-bold text-slate-900">
          {item.total_sessions != null && <span className="text-xs font-semibold text-gray-500">{item.total_sessions}회</span>}
          {item.class_fee != null ? `${item.class_fee.toLocaleString('ko-KR')}원` : '무료'}
          {hasMaterialFee && (
            <span className="text-[11px] font-normal text-gray-400">(재료비 {item.class_material_fee!.toLocaleString('ko-KR')}원 포함)</span>
          )}
        </p>
        {/* [라벨형 정보 줄 — 수업/접수/위치](2026-10-07 사용자 지시: "수업
            9.2~11.4 매주 수요일 11:00-12:20 / 접수 7.24(금) / 위치 롯데문화
            센터 본점 · 0.4km") */}
        <div className="flex gap-1.5 text-[11px] text-slate-600">
          <span className="w-7 shrink-0 text-sky-600 font-medium">수업</span>
          <span className="truncate">{scheduleLabel}</span>
        </div>
        <div className="flex gap-1.5 text-[11px] text-slate-600">
          <span className="w-7 shrink-0 text-sky-600 font-medium">접수</span>
          <span className="truncate">{registrationLabel ?? '일정은 상세 페이지에서 확인'}</span>
        </div>
        <div className="flex gap-1.5 text-[11px] text-slate-600">
          <span className="w-7 shrink-0 text-sky-600 font-medium">위치</span>
          <LocationLink item={item} label={`${formatStoreNameWithBrand(item) ?? '-'}${distanceLabel ? ` · ${distanceLabel}` : ''}`} />
        </div>
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
  const thumbnailUrl = getThumbnailUrl(item);
  const externalUrl = buildExternalApplyUrl(item);
  const bookmarkTarget = toBookmarkTarget(item);
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
          <span className="text-base font-bold text-slate-900">{BRAND_LABELS[item.brand]} 강좌 상세</span>
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
            <div className="flex flex-wrap items-center gap-1">
              {item.sub_category_name && (
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{item.sub_category_name}</span>
              )}
              {ageLabel && <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{ageLabel}</span>}
            </div>
            <h2 className="text-lg font-bold text-slate-900">{item.class_title}</h2>
            {item.instructor_name && <p className="text-sm text-slate-600">강사 {item.instructor_name}</p>}
            <p className="text-lg font-semibold text-slate-900">
              {item.class_fee != null ? `${item.class_fee.toLocaleString('ko-KR')}원` : '무료'}
              {hasMaterialFee && (
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (재료비 {item.class_material_fee!.toLocaleString('ko-KR')}원 포함)
                </span>
              )}
            </p>
            <hr className="my-1 border-gray-100" />
            <p className="text-sm text-slate-600">
              {formatScheduleDate(item.schedule_start_date)} ({(item.class_day ?? []).join(',')}) {formatTimeRange(item.start_time, item.end_time)}
              {item.total_sessions != null ? ` · 총 ${item.total_sessions}회` : ''}
            </p>
            {item.store_name && (
              <p className="text-sm text-slate-600">
                접수가능지점 <LocationLink item={item} label={`${formatStoreNameWithBrand(item)}${distanceLabel ? ` · ${distanceLabel}` : ''}`} />
              </p>
            )}
            {capacity != null && <p className="text-sm text-slate-600">정원 {capacity}명</p>}
            {likeCount != null && <p className="text-sm text-slate-600">좋아요 {likeCount}</p>}

            {/* [찜 버튼 — 빈 박스 방지](2026-10-07 사용자 지적: "찜 어디갔어")
                열심맘 미달/비로그인이면 BookmarkButton이 null을 반환하는데,
                테두리 박스를 항상 그려두면 그 자리에 빈 테두리만 남아 "찜이
                사라진 것처럼" 보였다 — 버튼 자체에 맡기고 래퍼를 없앤다. */}
            <div className="mt-2 flex items-center gap-2">
              {bookmarkTarget && <BookmarkButton target={bookmarkTarget} />}
              {/* [버튼 문구 — 상태를 그대로 동사처럼 쓰지 않음](2026-10-07
                  사용자 지적: "접수중하러 가기가 뭐야") "접수중"은 상태
                  명사라 "~하러 가기"를 붙이면 말이 안 됐다. 상태는 이미
                  뱃지로 따로 보이니 버튼은 고정 문구로 둔다. */}
              {externalUrl && !isClosed ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-orange-600"
                >
                  접수 페이지로 가기 ↗
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
      <span className="shrink-0 text-xs text-sky-600 font-medium">👶 기준</span>
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
  const { user, isLoading: isAuthLoading } = useUser();
  const { center } = useUserLocation();
  const [profile, setProfile] = useState<{ birth_years: number[]; birth_months: number[] } | null>(null);
  // [첫 로딩 중복 조회 제거](2026-10-09 사용자 지적: "처음 로딩때 너무
  // 느려보이지... 다른것도 불러오는게 많아서 다합쳐서 느려지는거같은데")
  // 실측 확인: useUser()의 로그인 여부 확인(auth.getUser)이 끝나기 전엔
  // user가 항상 null이라, 로그인 여부를 "아직 모름"과 "진짜 비로그인"을
  // 구분 못 하고 바로 profile=null로 확정해버렸다. 그 결과 1차로 연령
  // 필터 없는 basePool을 한 번 조회하고, 조금 뒤 로그인 확인이 끝나
  // 진짜 프로필이 들어오면 연령 필터가 있는 basePool을 다시 조회하는
  // 이중 요청(+그 사이 "로딩 끝→다시 로딩" 깜빡임)이 매 첫 진입마다
  // 발생했다 — 각 요청이 Supabase 왕복 고정 지연(~400~600ms, route.ts의
  // Branch-First 최적화 때 실측한 것과 동일 사실)을 또 한 번 더 먹는다.
  // isAuthLoading이 끝날 때까지는 profile 판정 자체를 미뤄 이 중복을
  // 없앤다(아래 basePool 조회도 이 판정이 끝나야 시작하도록 묶는다).
  const [isProfileReady, setIsProfileReady] = useState(false);
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
  // [코어 데이터 캐싱 & 로컬 필터링](2026-10-08 todo.md 개선사항1 사용자 지시):
  // "오직 '사용자의 위치 반경'이 변경되거나... '아이의 나이'가 바뀔 때만
  // Supabase로 가서 새로운 기본 데이터 풀을 조회... 이후 요일을 바꾸거나,
  // 지점을 켜고 끄거나, 키워드를 검색하는 등의 2차 필터링은 서버를 타지
  // 않고 이미 캐싱된 데이터에서 즉시 로컬 필터링." — basePool은 위치/반경/
  // 아이 나이로만 다시 조회되는 "기본 데이터 풀"이고, brand/지점/요일/
  // 카테고리/대상/검색어는 이 풀을 메모리에서 거르는 2차 필터로 바뀐다.
  const [basePool, setBasePool] = useState<CultureClubClass[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CultureClubClass | null>(null);

  // [아이 연령 — 1차 검색조건] 로그인 + 온보딩에서 받은 birth_years/
  // birth_months로 계산한다. calculateTotalMonthsFromBirthYearsAndMonths가
  // 이미 "둘 다 있어야 계산 가능, 음수(미래 출생)는 제외" 로직을 갖고 있다
  // (src/lib/ai-chat/personalization.ts).
  useEffect(() => {
    if (isAuthLoading) return; // 로그인 여부 자체가 아직 안 끝남 — 판정을 미룬다
    if (!user) {
      setProfile(null);
      setIsProfileReady(true);
      return;
    }
    let cancelled = false;
    setIsProfileReady(false);
    getMyProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p ? { birth_years: p.birth_years, birth_months: p.birth_months } : null);
        setIsProfileReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setIsProfileReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isAuthLoading]);

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
    const endpoint = STORE_ENDPOINT_BY_BRAND[brandKey];
    const params = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), radius_km: String(radiusKm) });
    fetch(`${endpoint}?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { stores?: StoreOption[] }) => setStores(data.stores ?? []))
      .catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey, radiusKm, center.lat, center.lng]);

  // [기본 데이터 풀 조회 — 위치/반경/아이 나이로만](2026-10-08 todo.md
  // 개선사항1) 서버가 거리 기준으로 모아주는 안전 상한(BASE_POOL_SIZE =
  // route.ts의 DISTANCE_SORT_FETCH_SAFETY_CEILING과 동일한 5,000)을 그대로
  // 요청해 "이 반경·연령 조건에 맞는 사실상 전부"를 한 번에 받아 캐싱한다.
  // brand/지점/요일/카테고리/대상/검색어는 여기 포함하지 않는다 — 전부
  // 아래 filteredItems에서 메모리로 거른다.
  const buildBasePoolUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (activeAgeMonths != null) params.set('age_months', String(activeAgeMonths));
    params.set('lat', String(center.lat));
    params.set('lng', String(center.lng));
    params.set('radius_km', String(radiusKm));
    params.set('page', '1');
    params.set('page_size', String(BASE_POOL_SIZE));
    return `/api/culture-club/search?${params.toString()}`;
  }, [activeAgeMonths, center.lat, center.lng, radiusKm]);

  useEffect(() => {
    // 연령 필터 여부가 아직 확정 안 됐으면 기다린다(위 "첫 로딩 중복
    // 조회 제거" 참고) — 여기서 멈춰도 isLoading은 초기값 true 그대로라
    // 로딩 화면은 계속 보인다(깜빡임 없이 매끄럽게 이어짐).
    if (!isProfileReady) return;

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    fetch(buildBasePoolUrl())
      .then((res) => res.json())
      .then((data: { items?: CultureClubClass[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setBasePool(data.items ?? []);
        setVisibleCount(PAGE_SIZE);
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
  }, [buildBasePoolUrl, isProfileReady]);

  // [2차 필터 — 로컬 메모리](2026-10-08 todo.md 개선사항1) brand/지점/요일/
  // 카테고리/대상/검색어는 서버를 다시 타지 않고 이미 캐싱된 basePool에서
  // 즉시 거른다. route.ts의 applyCommonFilters와 동일한 조건을 JS로 재현한다.
  const filteredItems = useMemo(() => {
    const q = appliedQuery.trim().toLowerCase();
    return basePool.filter((item) => {
      if (brandKey !== 'all' && item.brand !== brandKey) return false;
      if (brandKey !== 'all' && selectedStoreCodes.size > 0 && !selectedStoreCodes.has(item.store_code ?? '')) return false;
      if (selectedDays.size > 0 && !(item.class_day ?? []).some((d) => selectedDays.has(d as CultureClubDay))) return false;
      if (brandKey === 'emart' && selectedSubCategories.size > 0 && !selectedSubCategories.has(item.sub_category_name as CultureClubSubCategory))
        return false;
      if (brandKey === 'lottemart' && selectedTargets.size > 0 && !selectedTargets.has(item.raw_extra.target_code as string)) return false;
      if (q && !item.class_title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [basePool, brandKey, selectedStoreCodes, selectedDays, selectedSubCategories, selectedTargets, appliedQuery]);

  // 2차 필터가 바뀌면 "몇 개까지 보여줄지"를 처음(PAGE_SIZE)부터 다시
  // 센다 — 서버 재조회가 아니라 순수 로컬 상태 초기화라 체감 지연이 없다.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [brandKey, selectedStoreCodes, selectedDays, selectedSubCategories, selectedTargets, appliedQuery]);

  const items = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);
  const total = filteredItems.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredItems.length));
  }, [filteredItems.length]);

  const isEmpty = !isLoading && !errorMessage && filteredItems.length === 0;
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
            <span className="shrink-0 text-xs text-sky-600 font-medium">반경</span>
            {RADIUS_KM_OPTIONS.map((km) => (
              <button
                key={km}
                type="button"
                aria-pressed={radiusKm === km}
                onClick={() => setRadiusKm(km)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  radiusKm === km ? 'bg-sky-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
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
            <button type="submit" className="shrink-0 rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white">
              조회
            </button>
          </form>

          {/* [브랜드 필터 — 줄바꿈 허용](2026-10-09 사용자 지적: "글이 세로로
              안나오게 하자... 2줄로 되도 되니깐") 8개 브랜드로 늘어나며 한
              줄에 다 안 들어가는데, overflow-x-auto도 flex-wrap도 없이
              기본 flex-shrink만 걸려있어 pill 하나하나가 눌리면서 글자가
              세로로 줄바꿈되고 있었다 — 컨테이너에 flex-wrap, 각 버튼에
              shrink-0+whitespace-nowrap을 줘서 pill 단위로 다음 줄로
              넘어가게 한다(가로 스크롤 대신 2줄 허용). */}
          <div className="flex flex-wrap items-center gap-2 px-3 pt-1">
            {CULTURE_CLUB_BRAND_OPTIONS.map((brand) => {
              const isActive = brandKey === brand.key;
              return (
                <button
                  key={brand.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setBrandKey(brand.key)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive ? 'bg-sky-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
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
                      isActive ? 'bg-sky-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
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
                    isActive ? 'bg-sky-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
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
                      isActive ? 'bg-sky-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
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
                      isActive ? 'bg-sky-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
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
          {/* [문구 정확도 — "하루 1회"는 브랜드별로 다름](2026-10-09 사용자
              지적: "접수상태는 하루 1회 갱신된다는것도... 이거 각각의
              브랜드마다 다르잖아" → "접수상태는 하루 1회 갱신 맞아 ?")
              실측 확인(Windows 작업 스케줄러 "반복: 매" 값 직접 조회):
              이마트는 전용 경량 배치(emart-culture-club-status-refresh.mjs)
              가 30분마다 전체 강좌 상태를 갱신하고, 나머지 브랜드(롯데마트/
              현대백화점/신세계/AK플라자/스타필드/롯데백화점)는 일일 목록
              배치가 상태를 같이 갱신해 하루 1회뿐이다 — "하루 1회"로 단정
              하면 이마트는 과소평가, 반대로 "30분마다"로 단정하면 나머지
              브랜드는 과대평가가 된다. 혼합 브랜드 목록에 공통으로 보여줄
              문구라 양쪽 다 거짓이 되지 않는 "최소 하루 1회"로 바꾼다. */}
          {items.length > 0 && (
            <p className="mb-2 text-[11px] text-gray-400">
              ⏱ 마지막 업데이트 {formatUpdatedAt(items[0].collected_at)} · 접수 상태는 최소 하루 1회 갱신돼요(찜하면 더 자주 확인해 알려드려요)
            </p>
          )}
          {/* [반응형 — PC에서 여러 칸](2026-10-07 사용자 지적: "문센같은 경우
              PC에서 보면 한줄에 3개... 우리도 그렇게 안되나") — 모바일은
              1열 그대로, 화면이 넓어지면 2열(md)→3열(lg)로 늘린다. */}
          {items.length > 0 && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
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
