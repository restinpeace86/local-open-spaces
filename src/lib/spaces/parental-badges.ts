import { NearbyItem } from './get-nearby';

export type ParentalBadge = { key: string; label: string; emphasis?: boolean };

const BOOKING_STATUS_ICON: Record<string, string> = {
  오늘방문: '⚡',
  'D-1 마감임박': '⏳',
  주말예약: '📅',
};

// spec/space/space-card.md 'Parental Checkpoint Badges' 구현
function getSpaceBadges(item: NearbyItem): ParentalBadge[] {
  const badges: ParentalBadge[] = [{ key: 'is_free', label: item.is_free ? '🎁 무료' : '유료' }];

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
    const isUrgent = item.booking_status === 'D-1 마감임박' || item.booking_status === '오늘방문';
    const icon = BOOKING_STATUS_ICON[item.booking_status];
    badges.push({
      key: 'booking_status',
      label: icon ? `${icon} ${item.booking_status}` : item.booking_status,
      emphasis: isUrgent,
    });
  }

  badges.push({ key: 'is_free', label: item.is_free ? '🎁 무료' : '유료' });

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
