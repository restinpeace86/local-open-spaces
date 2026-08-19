import { NearbyItem } from '@/lib/spaces/get-nearby';

export type EventStatus = { label: string; tone: 'active' | 'urgent' | 'upcoming' | 'closed' };

// spec/event/event-card.md 2: 접수중/마감/진행중 등 상태 뱃지
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

  return { label: '진행중', tone: 'active' };
}
