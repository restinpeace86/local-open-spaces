import { NearbyItem } from '@/lib/spaces/get-nearby';

export type EventStatus = { label: string; tone: 'active' | 'urgent' | 'upcoming' | 'closed' };

// spec/event/event-card.md 2: 접수중/마감/진행중 등 상태 뱃지
// [todo.md 개선사항 4](2026-09-03): open_spaces 원본을 이벤트픽에 공유 노출하는 캠핑장/
// 체험휴양마을/교육농장/체험학습장은 시작/종료일 자체가 없는 상시 운영 공간이다
// (get-home-feed.ts getCategoryMinFeed가 toSpaceItem으로 start_date/end_date를 항상
// null로 채운다 — events 테이블은 두 컬럼 모두 NOT NULL이라 실제 이벤트에서는 이 조합이
// 나올 수 없다, 실측 확인). 날짜가 아예 없으면 "진행중"이 아니라 명시적으로 "상시"임을
// 보여준다(요구사항 원문 "[상시] 또는 [상시 운영] 뱃지").
export function getEventStatus(item: NearbyItem, today: Date = new Date()): EventStatus {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);

  if (item.is_reservation_required && item.reservation_end_date) {
    const deadline = new Date(item.reservation_end_date);
    if (deadline.getTime() < t.getTime()) {
      return { label: '접수마감', tone: 'closed' };
    }
    const daysLeft = Math.round((deadline.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 1) {
      return { label: '오늘 마감', tone: 'urgent' };
    }
    return { label: '접수중', tone: 'active' };
  }

  if (item.start_date) {
    const start = new Date(item.start_date);
    if (start.getTime() > t.getTime()) {
      return { label: '예정', tone: 'upcoming' };
    }
  }

  // 예약 마감 정보도, 시작일도 없는 경우에만 "상시"로 판단한다 — 실제 이벤트는
  // start_date/end_date가 NOT NULL이라 이 분기까지 올 수 없고(실측 확인), open_spaces
  // 공유 항목(캠핑장 등, toSpaceItem이 둘 다 null로 채움)만 이 마지막 폴백에 해당한다.
  if (!item.start_date && !item.end_date) {
    return { label: '상시', tone: 'active' };
  }

  return { label: '진행중', tone: 'active' };
}

export type DateBannerBadge = { label: string; kind: 'today_only' | 'ending_today' };

// Task 9-6-13: 메인카드 배너 2종 유형 분리 — 다일간 행사가 오늘로 끝나는 "오늘 마감"과
// 원래 하루짜리 행사인 "오늘 한정"은 사용자에게 다른 긴급성을 의미한다. getEventStatus의
// '오늘 마감'은 예약 접수 마감(reservation_end_date) 기준이라 별개 개념 — 이 배너는 행사
// 자체의 시작/종료일(start_date/end_date)만 본다. /events/today 피드는 이미 end_date=오늘인
// 행사만 내려주므로(get-home-feed.ts getTodayEvents), 실질적으로 start_date===end_date 여부만
// 갈라주면 된다.
export function getDateBannerBadge(item: NearbyItem, today: Date = new Date()): DateBannerBadge | null {
  if (item.item_type !== 'EVENT' || !item.start_date || !item.end_date) return null;

  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const end = new Date(item.end_date);
  end.setHours(0, 0, 0, 0);
  if (end.getTime() !== t.getTime()) return null;

  return item.start_date === item.end_date
    ? { label: '⚡ 오늘 한정', kind: 'today_only' }
    : { label: '⏰ 오늘 마감', kind: 'ending_today' };
}

export type ReservationAvailabilityTag = { label: string; tone: 'neutral' | 'warn' };

// Task 9-6-13: reservation_url이 없는 이벤트를 무조건 "길찾기"로만 폴백시키면 예약이 필요한
// 행사인지 현장에서 바로 참여 가능한 행사인지 구분이 안 된다. is_reservation_required로 두
// 경우를 나눠 안내한다 — 링크가 없다고 무조건 "현장방문 가능"으로 오인시키지 않기 위함.
// [예약 안내 뱃지 신뢰도 정비](2026-09-04 사용자 지시): "정보가 불충분한데 잘못된 정보를
// 줄 수 있는 뱃지는 과감하게 수정/제거"라는 지적에 따라 실제 데이터 근거를 추적했다.
// scripts/ingest/adapters/lib/schema-mapper.mjs의 buildEventRow는 isReservationRequired
// 기본값을 false로 둔다 — 그런데 실제 수집기 코드 전체를 뒤져보면(gg-culture-events-
// adapter.mjs/seoul-culture-events.mjs/tour-api-festival.mjs) "isReservationRequired: false"가
// 등장하는 자리는 전부 deriveBookingStatus(다른 필드) 호출에만 쓰이고, buildEventRow에는
// 단 한 번도 명시적으로 전달되지 않는다 — 즉 오늘 DB에 있는 모든 false 값은 "예약이
// 필요 없다고 확인됨"이 아니라 "그 수집기가 이 필드를 아예 다루지 않아 기본값으로
// 떨어진 것"뿐이다(실측 확인, 전체 어댑터에서 명시적 true는 SEOUL_YEYAK 한 곳뿐 — "이
// 소스는 전건 사전 예약 필수"라는 진짜 근거가 있다). 확정되지 않은 사실을 확정된 것처럼
// 보여주지 않는다는 원칙(제3장 제5조 추측 금지)에 따라, 실제 근거가 있는 "사전예약필요"만
// 남기고 근거 없는 "예약불필요 / 현장방문" 단정은 제거한다(뱃지를 아예 노출하지 않음 —
// detail-modal.tsx의 렌더 조건은 이 함수가 null을 반환하면 자연히 숨겨진다).
export function getReservationAvailabilityTag(item: NearbyItem): ReservationAvailabilityTag | null {
  if (item.item_type !== 'EVENT' || item.reservation_url) return null;

  return item.is_reservation_required ? { label: '📋 사전예약필요 (링크미제공)', tone: 'warn' } : null;
}
