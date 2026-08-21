import { NearbyItem } from './get-nearby';

export type ParentalBadge = { key: string; label: string; emphasis?: boolean };

// Task 9-1(2026-08-22) 발견: DB에 실제 저장되는 booking_status 원본값(scripts/ingest/lib/ai-tagging.mjs
// deriveBookingStatus: '오늘방문'/'D-1 마감임박'/'접수중'/null)과 spec/event/event-card.md·docs/spec.md에
// 적힌 표시 문구("오늘 당일 입장 가능" 등)가 서로 다르다 — DB는 짧은 코드값을, 스펙은 풀 문구를 쓴다.
// 이전 코드는 원본값을 그대로 아이콘만 붙여 노출해(예: "⚡ 오늘방문") 스펙 문구와 어긋나 있었다.
// 여기서 원본값 → 스펙 표시 문구로 매핑한다. '주말예약'은 실제로 ETL이 만들어내지 않는 값이라
// 제거했고(추측성 매핑 정리), '사전 예약 필수'는 스펙에 언급되나 ETL이 별도로 구분해 생성하지
// 않는 상태(예약 필수이면서 D-1이 아니면 그냥 '접수중')라 매핑 없이 원본값을 그대로 보여준다.
// event-card.md 3: "'D-1 마감임박' 및 '오늘 당일 입장 가능' 뱃지는 시인성을 위해 강조 컬러 적용"
const BOOKING_STATUS_LABEL: Record<string, { icon: string; label: string; emphasis?: boolean }> = {
  오늘방문: { icon: '⚡', label: '오늘 당일 입장 가능', emphasis: true },
  'D-1 마감임박': { icon: '⏳', label: 'D-1 마감임박', emphasis: true },
  접수중: { icon: '📅', label: '접수중' },
};

// spec/space/space-card.md 'Parental Checkpoint Badges' 구현
function getSpaceBadges(item: NearbyItem): ParentalBadge[] {
  const badges: ParentalBadge[] = [];

  // is_free === null(정보 없음)은 요금 뱃지를 숨긴다 — null을 유료로 단정 표시하지 않는다.
  if (item.is_free === true) badges.push({ key: 'is_free', label: '🎁 무료' });
  else if (item.is_free === false) badges.push({ key: 'is_free', label: '💰 유료' });

  if (item.has_parking) badges.push({ key: 'parking', label: '🅿️ 주차가능' });
  if (item.is_kids_friendly) badges.push({ key: 'kids', label: '👶 키즈' });
  if (item.stroller_accessible) badges.push({ key: 'stroller', label: '🛺 유모차가능' });
  if (item.facility_type) badges.push({ key: 'facility_type', label: item.facility_type });

  return badges.slice(0, 4);
}

// spec/event/event-card.md 'Parental Checkpoint Badges' 구현
function getEventBadges(item: NearbyItem): ParentalBadge[] {
  const badges: ParentalBadge[] = [];

  if (item.booking_status) {
    const mapped = BOOKING_STATUS_LABEL[item.booking_status];
    badges.push({
      key: 'booking_status',
      label: mapped ? `${mapped.icon} ${mapped.label}` : item.booking_status,
      emphasis: mapped?.emphasis,
    });
  }

  // Task 9-1에서 수정: is_free === null(요금 정보 미기재)을 유료로 단정 표시하던 오탐을 바로잡는다
  // (space-card.md의 null 숨김 규약을 event 카드에도 동일 적용 — SEOUL_CULTURE/GG_EVENTS 실데이터에
  // is_free: null 레코드가 실제로 존재함, implementation/todo.md Task 8-4 참고).
  if (item.is_free === true) badges.push({ key: 'is_free', label: '🎁 완전 무료' });
  else if (item.is_free === false) badges.push({ key: 'is_free', label: '💰 유료' });

  // Quick Filter '👶 키즈/어린이' 스크리닝 기준(target_age_group이 유아/어린이 대상)과
  // 뱃지 노출 기준을 일치시켜, 필터로 걸러진 카드는 항상 근거 뱃지를 함께 보여준다.
  if (item.is_kids_friendly || item.target_age_group === '초등') {
    badges.push({ key: 'kids', label: '👶 키즈/어린이' });
  } else if (item.target_age_group === '영유아') {
    badges.push({ key: 'kids', label: '👶 유아전용' });
  }

  if (item.facility_type === '실내' || item.facility_type === '야외') {
    badges.push({ key: 'facility_type', label: item.facility_type });
  }

  return badges.slice(0, 4);
}

export function getParentalBadges(item: NearbyItem): ParentalBadge[] {
  return item.item_type === 'EVENT' ? getEventBadges(item) : getSpaceBadges(item);
}
