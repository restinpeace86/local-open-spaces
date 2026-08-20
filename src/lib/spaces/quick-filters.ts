import { NearbyItem } from './get-nearby';

export type QuickFilterKey = 'KIDS' | 'FREE' | 'TODAY_WEEKEND';

// spec/common/search.md 'Quick Filters & Parental Targeting'
export const QUICK_FILTER_OPTIONS: { key: QuickFilterKey; label: string }[] = [
  { key: 'KIDS', label: '👶 키즈' },
  { key: 'FREE', label: '🎁 무료' },
  { key: 'TODAY_WEEKEND', label: '⚡ 오늘/주말' },
];

// '👶 키즈/어린이': target_age_group이 유아/어린이 대상인 항목 스크리닝
function isKidsTargeted(item: NearbyItem): boolean {
  return Boolean(item.is_kids_friendly) || item.target_age_group === '영유아' || item.target_age_group === '초등';
}

// '🎁 무료 이용': is_free가 true인 항목 스크리닝
function isFree(item: NearbyItem): boolean {
  return item.is_free === true;
}

function getUpcomingWeekendDates(now: Date): string[] {
  const day = now.getDay();
  const daysUntilSat = (6 - day + 7) % 7;
  const daysUntilSun = (7 - day) % 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + daysUntilSat);
  const sun = new Date(now);
  sun.setDate(now.getDate() + daysUntilSun);
  return [sat.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)];
}

// '⚡ 오늘/주말 방문': 사전 예약 없이 당일/주말 즉시 이용 가능 항목 스크리닝
// - SPACE(상시 개방 공간)는 예약 개념이 없어 항상 즉시 이용 가능한 항목으로 취급한다.
// - EVENT는 예약 필수가 아니면서 오늘 또는 돌아오는 주말(토/일)이 진행 기간에 포함될 때만 통과시킨다.
function isTodayOrWeekendAvailable(item: NearbyItem, now: Date): boolean {
  if (item.item_type === 'SPACE') return true;
  if (item.is_reservation_required) return false;
  if (!item.start_date || !item.end_date) return false;

  const today = now.toISOString().slice(0, 10);
  if (today >= item.start_date && today <= item.end_date) return true;

  return getUpcomingWeekendDates(now).some((d) => d >= item.start_date! && d <= item.end_date!);
}

const PREDICATES: Record<QuickFilterKey, (item: NearbyItem, now: Date) => boolean> = {
  KIDS: (item) => isKidsTargeted(item),
  FREE: (item) => isFree(item),
  TODAY_WEEKEND: (item, now) => isTodayOrWeekendAvailable(item, now),
};

export function matchesQuickFilters(item: NearbyItem, activeFilters: QuickFilterKey[], now = new Date()): boolean {
  return activeFilters.every((key) => PREDICATES[key](item, now));
}
