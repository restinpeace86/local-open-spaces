import { NearbyItem } from '@/lib/spaces/get-nearby';

const LONG_RUNNING_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function getSpanDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

export function isLongRunning(item: NearbyItem): boolean {
  if (!item.start_date || !item.end_date) return false;
  return getSpanDays(item.start_date, item.end_date) >= LONG_RUNNING_THRESHOLD_DAYS;
}

// 캘린더 데이터 정제: 30일 이상 상시 항목과 단기 항목을 분리한다.
export function splitByDuration(items: NearbyItem[]): { shortTerm: NearbyItem[]; longRunning: NearbyItem[] } {
  const shortTerm: NearbyItem[] = [];
  const longRunning: NearbyItem[] = [];

  for (const item of items) {
    if (isLongRunning(item)) {
      longRunning.push(item);
    } else {
      shortTerm.push(item);
    }
  }

  return { shortTerm, longRunning };
}
