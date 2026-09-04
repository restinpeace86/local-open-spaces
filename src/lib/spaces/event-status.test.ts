import { describe, expect, it } from 'vitest';
import { getDateBannerBadge, getEventStatus, getReservationAvailabilityTag } from './event-status';
import { NearbyItem } from './get-nearby';

function makeEvent(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: '1',
    name: '테스트 행사',
    category: 'PERFORMANCE_FESTIVAL',
    distance_meters: -1,
    item_type: 'EVENT',
    lng: 127,
    lat: 37.5,
    address: null,
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: null,
    is_free: null,
    info_url: null,
    is_kids_friendly: null,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: null,
    booking_status: null,
    ...overrides,
  };
}

const TODAY = new Date('2026-08-25T00:00:00');

// [todo.md 개선사항 4](2026-09-03): open_spaces를 이벤트픽에 공유 노출하는 캠핑장 등은
// start_date/end_date가 둘 다 null인데(실제 이벤트는 두 컬럼 모두 NOT NULL이라 이 조합이
// 나올 수 없음) 기존에는 "진행중"으로 오인 표시됐다 — 명시적으로 "상시" 뱃지를 반환하는지
// 검증한다.
describe('getEventStatus', () => {
  it('start_date/end_date가 둘 다 없으면(open_spaces 공유 항목) "상시"를 반환한다', () => {
    const status = getEventStatus(makeEvent({ start_date: null, end_date: null }), TODAY);
    expect(status).toEqual({ label: '상시', tone: 'active' });
  });

  it('start_date가 미래면 "예정"을 반환한다', () => {
    const status = getEventStatus(makeEvent({ start_date: '2026-09-01', end_date: '2026-09-05' }), TODAY);
    expect(status.label).toBe('예정');
  });

  it('start_date가 오늘 이전이면 "진행중"을 반환한다', () => {
    const status = getEventStatus(makeEvent({ start_date: '2026-08-01', end_date: '2026-09-05' }), TODAY);
    expect(status.label).toBe('진행중');
  });

  it('예약 마감이 임박하면(오늘 이내) "오늘 마감"을 반환한다', () => {
    const status = getEventStatus(
      makeEvent({ is_reservation_required: true, reservation_end_date: '2026-08-25' }),
      TODAY
    );
    expect(status.label).toBe('오늘 마감');
  });
});

// Task 9-6-13: 메인카드 배너 2종 유형 분리 검증
describe('getDateBannerBadge', () => {
  it('start_date === end_date === 오늘이면 "오늘 한정" 배너를 반환한다', () => {
    const badge = getDateBannerBadge(
      makeEvent({ start_date: '2026-08-25', end_date: '2026-08-25' }),
      TODAY
    );
    expect(badge).toEqual({ label: '⚡ 오늘 한정', kind: 'today_only' });
  });

  it('다일간 행사이고 end_date가 오늘이면 "오늘 마감" 배너를 반환한다', () => {
    const badge = getDateBannerBadge(
      makeEvent({ start_date: '2026-08-20', end_date: '2026-08-25' }),
      TODAY
    );
    expect(badge).toEqual({ label: '⏰ 오늘 마감', kind: 'ending_today' });
  });

  it('end_date가 오늘이 아니면 배너를 반환하지 않는다', () => {
    const badge = getDateBannerBadge(
      makeEvent({ start_date: '2026-08-20', end_date: '2026-08-26' }),
      TODAY
    );
    expect(badge).toBeNull();
  });

  it('SPACE 항목에는 배너를 반환하지 않는다', () => {
    const badge = getDateBannerBadge(
      makeEvent({ item_type: 'SPACE', start_date: '2026-08-25', end_date: '2026-08-25' }),
      TODAY
    );
    expect(badge).toBeNull();
  });
});

// Task 9-6-13: 예약 버튼 미존재 시 예약 필요/불필요 안내 태그 검증
describe('getReservationAvailabilityTag', () => {
  it('reservation_url이 있으면 태그를 반환하지 않는다', () => {
    const tag = getReservationAvailabilityTag(makeEvent({ reservation_url: 'https://example.com' }));
    expect(tag).toBeNull();
  });

  it('reservation_url이 없고 is_reservation_required면 "사전예약필요(링크미제공)" 태그를 반환한다', () => {
    const tag = getReservationAvailabilityTag(
      makeEvent({ reservation_url: null, is_reservation_required: true })
    );
    expect(tag).toEqual({ label: '📋 사전예약필요 (링크미제공)', tone: 'warn' });
  });

  // [예약 안내 뱃지 신뢰도 정비](2026-09-04 사용자 지시): is_reservation_required=false는
  // 실측 확인 결과 어느 수집기도 명시적으로 단언한 적 없는 기본값일 뿐이다(전체
  // 어댑터에서 buildEventRow에 isReservationRequired:false를 넘기는 곳이 단 하나도
  // 없음) — 근거 없는 "예약불필요/현장방문" 단정을 더 이상 보여주지 않는다.
  it('reservation_url이 없고 is_reservation_required가 false/null이면(근거 없는 기본값) 태그를 반환하지 않는다', () => {
    expect(
      getReservationAvailabilityTag(makeEvent({ reservation_url: null, is_reservation_required: false }))
    ).toBeNull();
    expect(
      getReservationAvailabilityTag(makeEvent({ reservation_url: null, is_reservation_required: null }))
    ).toBeNull();
  });

  it('SPACE 항목에는 태그를 반환하지 않는다', () => {
    const tag = getReservationAvailabilityTag(makeEvent({ item_type: 'SPACE', reservation_url: null }));
    expect(tag).toBeNull();
  });
});
