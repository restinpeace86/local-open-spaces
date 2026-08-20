'use client';

import Link from 'next/link';
import { NotificationItem } from '@/lib/notifications/notification-storage';
import { formatDateTime } from '@/lib/spaces/format';

// spec/notification/notification-settings.md 4: 알림함 모달 리스트 노출
export function NotificationList({
  notifications,
  onSelect,
}: {
  notifications: NotificationItem[];
  onSelect: (notification: NotificationItem) => void;
}) {
  if (notifications.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-400">새로운 알림이 없어요.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {notifications.map((notification) => (
        <li key={notification.id}>
          <Link
            href={notification.link}
            onClick={() => onSelect(notification)}
            className="flex items-start gap-2 px-4 py-3 hover:bg-gray-50"
          >
            {!notification.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-600 shrink-0" aria-hidden />}
            <div className={notification.is_read ? 'text-gray-400' : 'text-gray-900'}>
              <p className="text-sm font-semibold">{notification.title}</p>
              <p className="text-sm">{notification.message}</p>
              <p className="mt-0.5 text-xs text-gray-400">{formatDateTime(notification.created_at)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
