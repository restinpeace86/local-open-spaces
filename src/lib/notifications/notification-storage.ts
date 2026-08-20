// spec/notification/notification-settings.md 3: LocalStorage 기반 알림 설정/알림함 스키마
export type NotificationRadius = '10km' | '20km' | '30km' | 'all';

export type NotificationSettings = {
  enabled: boolean;
  radius: NotificationRadius;
  target_ages: string[];
  d_minus_one_alert: boolean;
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  link: string;
};

const SETTINGS_KEY = 'user_notification_settings';
const NOTIFICATIONS_KEY = 'user_notifications';

// spec/notification/notification-settings.md 3.1 기본값: 알림 비활성화, 반경 10km, 예약 마감 알림 Off
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  radius: '10km',
  target_ages: [],
  d_minus_one_alert: false,
};

export function getStoredNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_SETTINGS;

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_NOTIFICATION_SETTINGS.enabled,
      radius: parsed.radius ?? DEFAULT_NOTIFICATION_SETTINGS.radius,
      target_ages: Array.isArray(parsed.target_ages) ? parsed.target_ages : DEFAULT_NOTIFICATION_SETTINGS.target_ages,
      d_minus_one_alert:
        typeof parsed.d_minus_one_alert === 'boolean'
          ? parsed.d_minus_one_alert
          : DEFAULT_NOTIFICATION_SETTINGS.d_minus_one_alert,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

// spec/notification/notification-settings.md 4: 설정 변경 즉시 저장
export function setStoredNotificationSettings(settings: NotificationSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getStoredNotifications(): NotificationItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NotificationItem[]) : [];
  } catch {
    return [];
  }
}

export function setStoredNotifications(notifications: NotificationItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
}
