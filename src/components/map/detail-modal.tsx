'use client';

import { useEffect, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getTargetAudienceLabel } from '@/lib/spaces/target-audience-meta';
import { formatDDay } from '@/lib/spaces/d-day';
import { getReservationAvailabilityTag } from '@/lib/spaces/event-status';
import { formatDistance, formatDateRange, formatDateTime } from '@/lib/spaces/format';
import { MiniMap } from '@/components/map/mini-map';
import { MapPreviewModal } from '@/components/map/map-preview-modal';
import { ReservationRequestModal } from '@/components/map/reservation-request-modal';
import { BookmarkButton } from '@/components/community/bookmark-button';

const NO_INFO_TEXT = '정보 준비 중 (공공 기관 문의)';

// [가격 및 메뉴 '준비 중' 플레이스홀더](2026-09-08 사용자 지시, todo.md
// 개선사항3-5): "MVP 단계에서 가격이나 메뉴 데이터가 아직 채워지지 않은
// 스팟의 경우, 빈 화면 대신 아래와 같은 플레이스홀더 문구를 노출하여
// 신뢰도를 유지합니다" — 주소 등 다른 필드의 기존 NO_INFO_TEXT("공공 기관
// 문의")와는 다른, 더 친근한 톤의 전용 문구를 그대로 지시받은 원문대로 쓴다.
const PRICE_PLACEHOLDER = '가격 정보 업데이트 준비 중입니다 ⏳';
const MENU_PLACEHOLDER = '상세 메뉴 정보는 순차적으로 추가될 예정이에요';
const HOURS_PLACEHOLDER = '영업시간 정보는 순차적으로 추가될 예정이에요';

// [개발 종합 요청] 스팟픽 MVP 스마트 폴백 아키텍처(2026-09-01 사용자 지시) 섹션 1
// "View Fallback": 우리 DB(spot_curations)에 관리자가 보강한 상세 정보가 있으면 그
// "풍성한" 정보를 쓰고, 없으면 지금까지처럼 공공데이터 기본 뼈대(주소/운영시간/
// info_url 등)를 그대로 인앱으로 보여준다 — 어느 쪽이든 외부로 나가지 않는다.
type SpotCuration = {
  id: string;
  spot_id: string;
  image_url: string | null;
  operating_hours_raw: string | null;
  open_time: string | null;
  close_time: string | null;
  break_start: string | null;
  break_end: string | null;
  last_order: string | null;
  menu_items: Array<{ name: string; price: number }>;
  // [가격 및 입장료 스마트 파싱](2026-09-08 개선사항1-3에서 관리자가 입력)
  child_fee: number | null;
  guardian_fee: number | null;
  naver_booking_url: string | null;
  curation_note: string | null;
  // [스팟픽 상세 카드 뱃지 영역](2026-09-10 사용자 지시, todo.md 개선사항3-2·2-2):
  // 구형 레거시 뱃지(5대 UI 카테고리) 대신 노출 중분류에 맞는 맞춤형 뱃지만
  // 보여준다. `/api/spot-curations`가 뱃지 키를 사람이 읽을 라벨로 미리 바꿔
  // badge_labels로 내려준다. min_age_recommended > 0이면 "만 x세 이상" 뱃지.
  badge_labels?: string[];
  min_age_recommended?: number | null;
};

// 있는 것만 이어붙인다(추측으로 빈 칸을 채우지 않음) — formatCuratedHours와 동일한
// 원칙.
function formatEntranceFee(curation: SpotCuration): string | null {
  const parts: string[] = [];
  if (curation.child_fee != null) parts.push(`어린이 ${curation.child_fee.toLocaleString()}원`);
  if (curation.guardian_fee != null) parts.push(`보호자 ${curation.guardian_fee.toLocaleString()}원`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// 구조화된 필드가 있으면 사람이 읽기 좋은 한 줄로 합친다(예: "10:00~22:00 (브레이크타임
// 15:00~17:00, 라스트오더 21:30)") — 관리자가 개별 필드를 일부만 채웠어도 있는 것만
// 이어붙인다(추측으로 빈 칸을 채우지 않음).
function formatCuratedHours(curation: SpotCuration): string | null {
  if (!curation.open_time && !curation.close_time) return null;
  const main = [curation.open_time, curation.close_time].filter(Boolean).join('~');
  const extras: string[] = [];
  if (curation.break_start || curation.break_end) {
    extras.push(`브레이크타임 ${[curation.break_start, curation.break_end].filter(Boolean).join('~')}`);
  }
  if (curation.last_order) extras.push(`라스트오더 ${curation.last_order}`);
  return extras.length > 0 ? `${main} (${extras.join(', ')})` : main;
}

// spec/space/space-detail.md, spec/event/event-detail.md: 공간/행사 상세 정보 모달
// 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로 표시한다.
// [상세보기 설명 추가](2026-08-27 사용자 지시): 제목만으로는 무슨 행사인지 알기 어려운
// 경우가 많다는 지적 — 설명이 이 글자 수를 넘으면 기본은 미리보기(line-clamp)로 줄이고
// "더보기" 버튼으로 펼친다. 모바일이 주 사용 환경(Decision 004)이라 터치에서 동작하지 않는
// 마우스 호버 툴팁 대신, 모바일/데스크톱 모두에서 동일하게 동작하는 펼치기 토글을 택했다.
const DESCRIPTION_PREVIEW_THRESHOLD = 60;

export function DetailModal({
  item,
  onClose,
  hideMapSection = false,
  onExpandGroup,
  isExpandingGroup = false,
  spotPickCard = false,
  deal = null,
}: {
  item: NearbyItem;
  onClose: () => void;
  // [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 4: /nearby(스팟픽)는 배경 화면
  // 자체가 이미 지도라 상세 모달 안에 또 지도(MiniMap)를 띄우고 "지도에서 보기" 버튼까지
  // 중복 노출하는 게 불필요하다. map-explorer.tsx만 이 값을 true로 넘긴다 — 다른 화면
  // (홈/캘린더/지역별 그리드, 그리고 이벤트픽 전반)은 배경이 지도가 아니라서 인앱
  // 미니맵이 여전히 유일한 위치 확인 수단이므로 기본값 false로 기존 동작을 그대로
  // 유지한다. 이벤트는 이 값과 무관하게 항상 기존 구조를 유지한다(요구사항 "이벤트픽은
  // 기존 리스트형 상세 구조 유지").
  hideMapSection?: boolean;
  // [장소 단위 대표 1건 노출 — 그룹 펼쳐보기](2026-09-09 사용자 지시): "장소기준으로는
  // 난지캠핑장 하나 아니야?" → "장소 단위로 묶어서 대표 1건만 노출.. 다건에 대하여서는
  // 클릭시 쫙 뜨는걸로 하자" — item.group_id가 있으면(관리자가 '중복 스팟 검토'로 묶은
  // 대표 항목) 같은 그룹의 나머지 예약 옵션을 펼쳐볼 수 있는 버튼을 보여준다. 이 콜백을
  // 넘긴 화면(map-explorer.tsx)만 버튼이 렌더링된다 — 넘기지 않으면(다른 화면) 기존과
  // 동일하게 아무것도 표시하지 않는다(MVP 범위: 스팟픽 지도 화면 한정, 제3장 제3조).
  onExpandGroup?: (groupId: string) => void;
  // onExpandGroup 호출 후 결과를 기다리는 동안(부모 상태) 버튼을 잠가 중복 클릭을 막는다.
  isExpandingGroup?: boolean;
  // [스팟픽 상세 카드 최종 UI](2026-09-10 사용자 지시, todo.md 개선사항3): 스팟픽
  // 지도에서 여는 상세 카드에만 적용되는 재설계 — 구형 레거시 뱃지 배제 + 맞춤형
  // 뱃지 노출, 거리 클릭 시 인앱 길찾기, 외부 예약 링크 없으면 예약 버튼 완전
  // 숨김, 네이버 블로그 후기 동적 버튼. map-explorer.tsx만 이 값을 넘긴다 —
  // 다른 화면(홈/이벤트픽/캘린더/지역별)은 기존 구조를 그대로 유지한다.
  spotPickCard?: boolean;
  // [제휴 상품 ↔ 스팟픽 마커 연동](2026-09-10 사용자 지시, todo.md 개선사항6):
  // 이 스팟에 노출 활성화된 제휴 상품이 연동돼 있으면, 특가 뱃지 + 제휴 링크 CTA를
  // 보여준다. map-explorer.tsx만 넘긴다.
  deal?: { title: string; bookingUrl: string } | null;
}) {
  const [copied, setCopied] = useState(false);
  const [isMapPreviewOpen, setIsMapPreviewOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  // undefined = 아직 조회 전(로딩), null = 큐레이션 없음(정상), 객체 = 큐레이션 있음.
  // spot_curations는 open_spaces에만 FK가 있어(이벤트는 대상 아님) 이벤트는 조회하지 않는다.
  const [curation, setCuration] = useState<SpotCuration | null | undefined>(undefined);
  // [스팟픽 상세 카드 네이버 블로그 후기](2026-09-10 사용자 지시, todo.md
  // 개선사항3-5): 10일 캐싱(TTL)이 적용된 /api/spot-blog-reviews를 스팟픽 카드에서만
  // 조회한다(다른 화면은 불필요한 요청을 만들지 않는다). URL이 0개면 영역 숨김.
  const [blogUrls, setBlogUrls] = useState<string[]>([]);
  // [실측 디버깅 발견 — 뒤로가기 인터셉트 제거](2026-08-29): 이 모달을 React onClick 경로
  // (리스트/카드 클릭 등)로 열면 useModalBackClose 내부의 history.pushState 호출이 Next.js
  // App Router의 자체 라우팅 감지와 충돌해 모달이 아예 커밋되지 않거나(상태가 조용히
  // 되돌아감) 실제 페이지 네비게이션급 리로드가 발생하는 것을 실측으로 확인했다(Playwright로
  // React Fiber를 직접 조회해 확인 — 클릭 핸들러는 정확히 실행되지만 DOM에 반영되지 않음).
  // 반면 카카오맵 마커 클릭(SDK의 순수 addEventListener 경로)으로 여는 동일 구조의
  // MarkerGroupModal은 정상 동작했다 — 즉 "React onClick으로 이 훅을 쓰는 모달을 여는" 모든
  // 경로에 잠재된 문제였다. DetailModal은 홈 피드/이벤트픽/캘린더/지역별 그리드 등 앱 전역에서
  // 카드 클릭으로 열리므로(전부 React onClick 경로) 사실상 상시 영향을 받고 있었다. 배경
  // 클릭/X 버튼으로는 여전히 정상적으로 닫히므로, 뒤로가기 제스처로 모달만 닫는 편의 기능만
  // 제거하고 핵심 기능(모달 열기/닫기)은 안전하게 복구한다.
  const meta = getCategoryMeta(item.category);
  const isEvent = item.item_type === 'EVENT';

  // [스팟픽 상세 카드 뱃지 영역](2026-09-10 사용자 지시, todo.md 개선사항3-2·2-2):
  // 구형 레거시 뱃지(meta.label — '키즈·액티비티' 등 5대 UI 카테고리)를 배제하고
  // 노출 중분류 맞춤형 뱃지(badge_labels)와 "만 x세 이상"(min_age_recommended > 0)만
  // 컴팩트하게 보여준다. 스팟픽 카드가 아닐 때는 기존 meta.label 그대로.
  const spotBadgeLabels = spotPickCard && !isEvent && Array.isArray(curation?.badge_labels) ? curation!.badge_labels! : [];
  const minAgeRecommended = spotPickCard && !isEvent ? curation?.min_age_recommended ?? 0 : 0;

  // [View/Reservation Fallback](2026-09-01 사용자 지시): 스팟(공간)에 한해 관리자가
  // 보강한 큐레이션 데이터를 조회한다. is_active=true인 것만 내려주는 공개 엔드포인트를
  // 쓴다(비활성화한 큐레이션은 즉시 공공데이터 기본 뷰로 돌아가야 함).
  useEffect(() => {
    if (isEvent) {
      setCuration(null);
      return;
    }
    let cancelled = false;
    setCuration(undefined);
    fetch(`/api/spot-curations?spot_id=${encodeURIComponent(item.id)}`)
      .then((res) => res.json())
      .then((data: { item?: SpotCuration | null }) => {
        if (!cancelled) setCuration(data.item ?? null);
      })
      .catch(() => {
        // 조회 실패 시 큐레이션 없는 것으로 간주 — 기존 공공데이터 뷰로 안전하게 폴백한다.
        if (!cancelled) setCuration(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, isEvent]);

  // [스팟픽 상세 카드 네이버 블로그 후기](2026-09-10 개선사항3-5): 스팟픽 카드에서만,
  // 스팟(공간)에 한해 조회한다. 실패/0건이면 조용히 빈 배열 — 영역이 숨겨진다.
  useEffect(() => {
    if (!spotPickCard || isEvent) {
      setBlogUrls([]);
      return;
    }
    let cancelled = false;
    setBlogUrls([]);
    fetch(`/api/spot-blog-reviews?spot_id=${encodeURIComponent(item.id)}`)
      .then((res) => res.json())
      .then((data: { item?: { urls?: string[] } }) => {
        if (!cancelled) setBlogUrls(Array.isArray(data.item?.urls) ? data.item!.urls! : []);
      })
      .catch(() => {
        if (!cancelled) setBlogUrls([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, isEvent, spotPickCard]);
  // Task 9-6-2(2026-08-23, Decision 009): location_precision이 없으면(SPACE, 기존 EXACT 전용
  // 경로) EXACT로 간주한다. CITY_APPROX/UNKNOWN은 정확한 행사장 위치가 아니므로 지도/길찾기를
  // 보여주면 사용자를 오도한다 — 근사·미상 좌표를 정확한 핀처럼 그리지 않는다.
  const hasExactLocation = (item.location_precision ?? 'EXACT') === 'EXACT';
  // [중복 지도 뷰 제거](2026-09-01 사용자 지시): 스팟픽 지도 화면(hideMapSection)에서
  // "정확한 좌표라 실제로 지도를 보여줄 수 있는" 스팟만 미니맵/지도 CTA를 생략한다 —
  // 좌표가 부정확해 애초에 지도 대신 안내 문구만 뜨던 경우는 hideMapSection과 무관하게
  // 그대로 보여준다(그 문구는 배경 지도와 중복되는 정보가 아니라 "왜 위치가 부정확한지"
  // 설명하는 유용한 정보라 제거 대상이 아니다).
  const shouldHideMapForSpotScreen = hideMapSection && !isEvent && hasExactLocation;

  const dDay = isEvent ? formatDDay(item.reservation_end_date ?? item.end_date) : null;
  const period = isEvent ? formatDateRange(item.start_date, item.end_date) : null;
  // [카드 표준 중분류/연령대상 표시](2026-08-27 사용자 지시): 상세보기에 연령대상(초등학생
  // 이상/미취학/가족/유아 등)을 안내한다. OTHER(수동 검수 대상)나 매핑 안 된 값은 null이라
  // 노출하지 않는다(getTargetAudienceLabel 참고).
  const targetAudienceLabel = isEvent ? getTargetAudienceLabel(item.target_audience) : null;
  const description = isEvent ? item.description : null;
  const isLongDescription = (description?.length ?? 0) > DESCRIPTION_PREVIEW_THRESHOLD;
  const reservationDeadline = isEvent && item.is_reservation_required
    ? formatDateTime(item.reservation_end_date)
    : null;
  // Task 9-6-13: reservation_url이 없는 이벤트는 무조건 "길찾기"로만 폴백되어 예약 필요
  // 여부를 알 수 없었다 — 예약불필요/현장방문 vs 사전예약필요(링크미제공)를 구분해 안내한다.
  const reservationTag = isEvent ? getReservationAvailabilityTag(item) : null;

  // [외부 지도 앱 연동 제거 및 인앱 위치 보기](2026-08-30 사용자 지시): Decision 011의
  // 3분류 중 세 번째("길찾기")가 네이버 지도 앱/웹으로 유저를 내보내던 것을 제거하고,
  // 이미 존재하는 인앱 미니맵의 "🔍 크게보기"(MapPreviewModal, Kakao Maps SDK)를 여는
  // 버튼으로 대체한다 — 유저가 앱을 이탈하지 않고 위치를 확인할 수 있게 한다(요구사항 1).
  // Task 9-6-11(2026-08-25, Decision 011 개정): 상세 CTA 조건부 3분류 —
  // 1) 공공/무료(is_free=true 또는 reservation_url 존재) → 공공 예약하기
  // 2) 유료/민간 제휴(is_free=false 및 affiliate_url 존재) → 할인 예매하기
  // 3) 그 외(위 링크 미존재) → 지도에서 길찾기(정확한 좌표가 있을 때만, 인앱 지도 모달 오픈)
  // [개선사항1](2026-09-04 사용자 지시): 버튼명을 "지도에서 보기" → "지도에서 길찾기"로
  // 변경 — 이 버튼이 여는 MapPreviewModal 안에 실제로 "🧭 현재 위치에서 길찾기" 기능
  // (인앱 경로 표시, 2026-09-03 도입)이 있으므로, 버튼명이 실제 기능을 더 정확히
  // 안내하도록 직관적으로 바꾼다.
  // 공간은 reservation_url 컬럼이 없어(project/database_schema.md 3.1) 늘 null이므로,
  // is_free=true인데 reservation_url이 없는 공간은 기존처럼 info_url을 공식 링크로 대신 쓴다.
  // [todo.md 개선사항 4](2026-09-03): isEvent일 때 info_url을 무조건 null 취급하면
  // open_spaces를 공유해 이벤트픽에 노출하는 캠핑장/체험휴양마을 등(item_type='EVENT'로
  // 표시되지만 실제로는 스팟 데이터라 info_url이 채워져 있음)이 안내 링크를 잃는다.
  // 진짜 이벤트는 toEventItem이 info_url을 항상 null로 채우므로(get-home-feed.ts) 이
  // 조건을 없애도 기존 이벤트 동작에는 전혀 영향이 없다.
  const publicReservationUrl = item.reservation_url ?? item.info_url;
  const cta = (item.is_free === true || !!item.reservation_url) && publicReservationUrl
    ? { type: 'link' as const, label: '🏛️ 공공 예약하기', href: publicReservationUrl }
    : item.is_free === false && item.affiliate_url
    ? { type: 'link' as const, label: '🎟️ 할인 예매하기', href: item.affiliate_url }
    : hasExactLocation && !shouldHideMapForSpotScreen
    ? { type: 'map' as const, label: '🗺️ 지도에서 길찾기' }
    : null;

  // [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시): 직전에 붙였던 "정보
  // 없으면 네이버 검색 딥링크로 내보내기" 폴백을 완전히 제거하고, 대신 공식 홈페이지가
  // 없는 스팟은 우리 플랫폼 자체 신청 폼으로 흡수한다 — 유저를 외부로 보내지 않고
  // 서비스 안에서 신청 접수까지 끝낸다. reservations 테이블의 FK가 open_spaces만
  // 참조하므로(스팟 전용) 위 3분류 CTA와 마찬가지로 isEvent가 아닐 때만 노출한다.
  //
  // [예약 및 링크 폴백 체인](2026-09-01 사용자 지시): 위 2026-08-29 순서(공식 링크 →
  // 자체 신청 폼)는 그대로 유지하고, 그 사이에 "공공예약/원본 링크도 없지만 관리자가
  // 실제 네이버 예약 연동을 확인해 등록한 민간 스팟" 한 단계만 끼워 넣는다 — 이미
  // 구축된 자체 신청 폼(2026-08-29 결정)을 대체하는 게 아니라, 더 나은 실제 채널이
  // 있을 때만 그쪽을 우선한다: info_url(공식/공공) → naver_booking_url(관리자 확인
  // 네이버 예약) → 자체 간편 예약/신청 폼(둘 다 없을 때의 최종 폴백).
  //
  // [예약 버튼 노출 조건 엄격화](2026-09-01 사용자 지시): 자체 간편 예약 폼을 "예약
  // 데이터가 전혀 없어도 무조건 뜨는" 만능 폴백으로 두지 않는다 — spot_curations에
  // is_active 큐레이션이 있다는 것 자체를 "관리자가 이 스팟을 확인하고 문의를 받을
  // 준비가 됐다"는 실제 신호로 삼는다(스키마에 별도 "예약 가능 여부" 플래그가 없어
  // 새로 만들지 않고 기존 신호를 재해석 — 제3장 제5조 추측 금지에 따라 근거 없는 새
  // 컬럼을 만들지 않았다). 셋 다 없는(비큐레이션) 절대다수의 공공데이터 스팟은 이제
  // 예약 버튼 대신 안내 텍스트만 보여준다 — 무료 시설은 "예약 필요 없음", 그 외는
  // 정보 없음 안내로 오해를 방지한다.
  // [스팟픽 상세 카드 예약 버튼 조건부 렌더링](2026-09-10 사용자 지시, todo.md
  // 개선사항3-7·2-4): "현재 자사 예약 시스템이 구축되지 않은 상태이므로, 하단
  // 버튼은 스팟별 DB에 등록된 외부 예약 링크(예: 네이버 예약 URL 등)의 유무에
  // 따라 조건부로 노출". case 1(링크 있음) → 외부 연동 버튼, case 2(링크 없음) →
  // "뜬금없는 '간편 예약/신청하기' 버튼이 노출되지 않도록" 영역 완전 숨김.
  // 스팟픽 카드에서는 자체 간편 예약 폼(2026-08-29 도입)과 안내 텍스트를 쓰지
  // 않는다 — 다른 화면(홈/이벤트픽/캘린더/지역별)은 기존 폴백 체인을 그대로 유지.
  const secondaryAction = isEvent
    ? null
    : item.info_url
    ? { type: 'link' as const, label: '🌐 공식 홈페이지 바로가기', href: item.info_url }
    : curation?.naver_booking_url
    ? { type: 'link' as const, label: '🟢 네이버로 예약하기', href: curation.naver_booking_url }
    : spotPickCard
    ? null
    : curation
    ? { type: 'reservation' as const, label: '📝 간편 예약/신청하기' }
    : {
        type: 'info' as const,
        label: item.is_free === true ? '예약 필요 없음 · 상시 무료 입장' : '예약 관련 정보가 없습니다',
      };

  async function handleCopyAddress() {
    if (!item.address) return;
    try {
      await navigator.clipboard.writeText(item.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근이 차단된 환경에서는 조용히 무시한다.
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[480px] max-h-[85vh] md:max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isEvent && item.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt={item.name}
            className="w-full h-40 object-cover rounded-t-2xl md:rounded-t-2xl"
          />
        )}
        {/* [View Fallback](2026-09-01 사용자 지시): 스팟은 원래 헤더 이미지가 없었다
            (공공데이터에 이미지 필드 자체가 없음) — 관리자가 spot_curations에 등록한
            대표 이미지가 있으면(is_active) 그 "풍성한" 이미지를 보여준다. */}
        {!isEvent && curation?.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={curation.image_url}
            alt={item.name}
            className="w-full h-40 object-cover rounded-t-2xl md:rounded-t-2xl"
          />
        )}

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* [카드 표준 중분류 표시](2026-08-27 사용자 지시): event_type 기반 5대 UI
                  카테고리 대신 실제 표준 중분류(category_min)를 보여준다(이벤트 한정).
                  [스팟픽 상세 카드 뱃지 영역](2026-09-10 개선사항3-2·2-2): 스팟픽
                  카드는 구형 레거시 뱃지(meta.label)를 배제하고 맞춤형 뱃지만 노출. */}
              {spotPickCard && !isEvent ? (
                <>
                  {deal && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                      🔥 특가
                    </span>
                  )}
                  {minAgeRecommended > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      만 {minAgeRecommended}세 이상
                    </span>
                  )}
                  {spotBadgeLabels.map((label) => (
                    <span
                      key={label}
                      className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
                    >
                      {label}
                    </span>
                  ))}
                </>
              ) : (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: meta.color }}
                >
                  {isEvent ? (item.category_min ?? meta.label) : meta.label}
                </span>
              )}
              {dDay && <span className="text-xs font-semibold text-red-600">{dDay}</span>}
              {!isEvent && item.is_free !== null && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  {item.is_free ? '무료' : '유료'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          <div className="mt-2 flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-900">{item.name}</h2>
            <BookmarkButton target={isEvent ? { kind: 'event', eventId: item.id } : { kind: 'spot', spotId: item.id }} />
          </div>
          {/* [스팟픽 상세 카드 인터랙티브 거리/길찾기](2026-09-10 사용자 지시, todo.md
              개선사항3-3·2-4): "현재 거리 클릭 시 서비스 내에 구현되어 있는 인앱 길찾기
              API를 정상 호출하여 내 위치 기준 길안내 실행. 해당 거리 누르면 길 찾기가
              될 거라는걸 직관적으로 알수 있게 노출." 정확한 좌표가 있을 때만 버튼으로,
              아니면 기존처럼 단순 텍스트. */}
          {item.distance_meters >= 0 &&
            (spotPickCard && hasExactLocation ? (
              <button
                type="button"
                onClick={() => setIsMapPreviewOpen(true)}
                className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
              >
                🧭 현재 위치에서 {formatDistance(item.distance_meters)} · 길찾기 <span aria-hidden>›</span>
              </button>
            ) : (
              <p className="text-sm text-gray-400">현재 위치에서 {formatDistance(item.distance_meters)}</p>
            ))}

          {!isEvent && item.group_id && onExpandGroup && (
            <button
              type="button"
              onClick={() => onExpandGroup(item.group_id as string)}
              disabled={isExpandingGroup}
              className="mt-1 text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
            >
              {isExpandingGroup ? '불러오는 중...' : '🔗 이 장소의 다른 예약 옵션 보기'}
            </button>
          )}

          {/* [제휴 상품 연동 CTA](2026-09-10 사용자 지시, todo.md 개선사항6): 이 스팟에
              연동된 노출 활성화 제휴 상품이 있으면 눈에 띄는 특가 버튼으로 연결한다. */}
          {spotPickCard && !isEvent && deal && (
            <a
              href={deal.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
            >
              🔥 {deal.title} · 특가 보기
            </a>
          )}

          {/* [스팟픽 상세 카드 네이버 블로그 후기 바로가기](2026-09-10 사용자 지시,
              todo.md 개선사항3-5): 10일 캐싱(TTL)이 적용된 blog_urls를 활용해 저장된
              URL 개수(최대 3개)만큼 동적으로 버튼을 노출한다. 터치 시 새 창(아웃바운드)
              으로 열려 우리 앱 상태가 그대로 유지된다. URL이 없으면 영역 숨김. */}
          {spotPickCard && !isEvent && blogUrls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {blogUrls.map((url, i) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-green-500 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                >
                  📝 블로그 후기 {i + 1}
                </a>
              ))}
            </div>
          )}

          {/* [상세보기 설명 추가](2026-08-27 사용자 지시): 제목만으로 내용을 파악하기 어려운
              행사가 많아 본문 설명을 보여준다. 짧으면 그대로, 길면(60자 초과) 2줄 미리보기 +
              "더보기/접기" 토글로 감춘다. */}
          {description && (
            <div className="mt-2">
              <p className={`text-sm text-gray-600 whitespace-pre-line ${!isDescriptionExpanded && isLongDescription ? 'line-clamp-2' : ''}`}>
                {description}
              </p>
              {isLongDescription && (
                <button
                  type="button"
                  onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                  className="mt-0.5 text-xs font-semibold text-blue-600"
                >
                  {isDescriptionExpanded ? '접기' : '더보기'}
                </button>
              )}
            </div>
          )}

          <dl className="mt-4 flex flex-col gap-3 text-sm">
            {!isEvent && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">주소</dt>
                <dd className="text-right text-gray-900 flex items-center gap-2">
                  <span>{item.address || NO_INFO_TEXT}</span>
                  {item.address && (
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      {copied ? '복사됨' : '복사'}
                    </button>
                  )}
                </dd>
              </div>
            )}

            {!isEvent && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">운영시간</dt>
                {/* [View Fallback](2026-09-01 사용자 지시): 관리자가 구조화한 영업시간
                    (오픈~마감/브레이크타임/라스트오더)이 있으면 그걸 우선 보여주고,
                    없으면 원문(operating_hours_raw) → 공공데이터 기본값 순으로
                    폴백한다 — 추측으로 빈 칸을 만들지 않는다. */}
                <dd className="text-right text-gray-900">
                  {(curation && formatCuratedHours(curation)) ||
                    curation?.operating_hours_raw ||
                    item.operating_hours ||
                    HOURS_PLACEHOLDER}
                </dd>
              </div>
            )}

            {/* [가격 및 메뉴 '준비 중' 플레이스홀더](2026-09-08 개선사항3-5): 입장료가
                아직 없으면 빈 화면 대신 전용 문구를 보여준다(주소처럼 "이미 공공데이터에
                항상 있어야 할 정보"가 아니라 관리자 큐레이션에 의존하는 정보라, 로딩
                중(curation === undefined)에는 아직 판단하지 않고 잠시 아무것도 보여주지
                않는다 — 로딩 끝나면 즉시 실제 값 또는 플레이스홀더로 확정된다). */}
            {!isEvent && curation !== undefined && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">가격</dt>
                {/* item.is_free===true(공공데이터로 이미 확인된 무료 시설)면 굳이
                    "준비 중"이라는 오해의 소지가 있는 문구 대신 이미 아는 사실을
                    그대로 보여준다 — 신뢰도 유지라는 취지에 더 부합한다. */}
                <dd className="text-right text-gray-900">
                  {(curation && formatEntranceFee(curation)) ||
                    (item.is_free === true ? '무료입장' : PRICE_PLACEHOLDER)}
                </dd>
              </div>
            )}

            {/* [View Fallback](2026-09-01 사용자 지시) "풍성한 뷰": 관리자가 등록한 메뉴가
                있으면 보여준다. 공공데이터에는 메뉴 개념 자체가 없어 큐레이션 전용 정보다.
                [가격 및 메뉴 '준비 중' 플레이스홀더](2026-09-08 개선사항3-5): 메뉴가 없어도
                행 자체는 숨기지 않고 전용 문구로 대신한다. */}
            {!isEvent && curation !== undefined && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">메뉴</dt>
                <dd className="text-right text-gray-900">
                  {curation && curation.menu_items.length > 0 ? (
                    <ul className="flex flex-col gap-0.5">
                      {curation.menu_items.map((menuItem, i) => (
                        <li key={`${menuItem.name}-${i}`}>
                          {menuItem.name} · {menuItem.price.toLocaleString()}원
                        </li>
                      ))}
                    </ul>
                  ) : (
                    MENU_PLACEHOLDER
                  )}
                </dd>
              </div>
            )}

            {isEvent && period && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">행사 기간</dt>
                <dd className="text-right text-gray-900">{period}</dd>
              </div>
            )}

            {isEvent && targetAudienceLabel && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">연령대상</dt>
                <dd className="text-right text-gray-900">{targetAudienceLabel}</dd>
              </div>
            )}

            {isEvent && (item.is_reservation_required || reservationTag) && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">예약 안내</dt>
                <dd className="text-right text-gray-900">
                  {reservationTag ? (
                    <span className={reservationTag.tone === 'warn' ? 'text-amber-600 font-medium' : 'text-gray-700'}>
                      {reservationTag.label}
                    </span>
                  ) : (
                    '사전 예약 필수'
                  )}
                  {reservationDeadline && (
                    <span className="block text-red-600 font-medium">
                      마감: {reservationDeadline}
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {/* Task 9-5-1: 콤팩트 인앱 미니맵 — 상세 화면을 벗어나지 않고 위치를 바로 확인하고,
              "🔍 크게보기"로 풀스크린 지도 모달을 띄운다.
              Task 9-6-2: 근사/미상 좌표(CITY_APPROX/UNKNOWN)는 정확한 위치가 아니므로 지도 대신
              안내 문구만 보여준다(정확한 핀처럼 오인시키지 않기 위함). */}
          {shouldHideMapForSpotScreen ? null : hasExactLocation ? (
            <div className="mt-4 relative rounded-xl overflow-hidden border border-gray-200">
              <MiniMap lat={item.lat} lng={item.lng} name={item.name} address={item.address} className="w-full h-40" />
              <button
                type="button"
                onClick={() => setIsMapPreviewOpen(true)}
                className="absolute bottom-2 right-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/90 text-gray-700 shadow hover:bg-white"
              >
                🔍 크게보기
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">
              📍 {item.sigungu_name ? `${item.sigungu_name} 일대 (정확한 위치 정보 없음)` : '정확한 위치 정보가 없는 행사입니다'}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            {cta?.type === 'link' && (
              <a
                href={cta.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-lg text-white text-sm font-medium py-2.5"
                style={{ backgroundColor: meta.color }}
              >
                {cta.label}
              </a>
            )}
            {cta?.type === 'map' && (
              <button
                type="button"
                onClick={() => setIsMapPreviewOpen(true)}
                className="flex-1 text-center rounded-lg text-white text-sm font-medium py-2.5"
                style={{ backgroundColor: meta.color }}
              >
                {cta.label}
              </button>
            )}
            {secondaryAction?.type === 'link' && (
              <a
                href={secondaryAction.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-lg border border-gray-300 text-gray-700 text-sm font-medium py-2.5 hover:bg-gray-50"
              >
                {secondaryAction.label}
              </a>
            )}
            {secondaryAction?.type === 'reservation' && (
              <button
                type="button"
                onClick={() => setIsReservationModalOpen(true)}
                className="flex-1 text-center rounded-lg border border-gray-300 text-gray-700 text-sm font-medium py-2.5 hover:bg-gray-50"
              >
                {secondaryAction.label}
              </button>
            )}
            {/* [예약 버튼 노출 조건 엄격화](2026-09-01 사용자 지시): 실제 예약 채널이
                하나도 없으면 버튼 대신 안내 텍스트만 보여준다(무료 시설은 "예약 필요
                없음", 그 외는 정보 없음). cta가 없는 스팟픽 화면(지도 CTA 생략)에서는
                이 텍스트가 액션 행의 유일한 내용이 된다. */}
            {secondaryAction?.type === 'info' && (
              <p className="flex-1 text-center text-sm text-gray-400 py-2.5">{secondaryAction.label}</p>
            )}
          </div>
        </div>
      </div>

      {isMapPreviewOpen && (
        <MapPreviewModal
          lat={item.lat}
          lng={item.lng}
          name={item.name}
          address={item.address}
          onClose={() => setIsMapPreviewOpen(false)}
        />
      )}

      {isReservationModalOpen && (
        <ReservationRequestModal
          spotId={item.id}
          spotName={item.name}
          onClose={() => setIsReservationModalOpen(false)}
        />
      )}
    </div>
  );
}
