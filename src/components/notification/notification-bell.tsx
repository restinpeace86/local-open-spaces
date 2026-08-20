'use client';

import { useCallback, useEffect, useState } from 'react';
import { getStoredUserLocation } from '@/lib/location/user-location-storage';
import { generateNotifications } from '@/lib/notifications/generate-notifications';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationItem,
  NotificationSettings,
  getStoredNotificationSettings,
  getStoredNotifications,
  setStoredNotificationSettings,
  setStoredNotifications,
} from '@/lib/notifications/notification-storage';
import { NotificationList } from './notification-list';
import { NotificationSettingsForm } from './notification-settings-form';

// spec/notification/notification-settings.md 4: Header 🔔 아이콘 + 알림함/설정 팝오버
export function NotificationBell() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'list' | 'settings'>('list');

  const refreshNotifications = useCallback(async (currentSettings: NotificationSettings) => {
    const location = getStoredUserLocation();
    if (!location) return;

    try {
      const generated = await generateNotifications({ lat: location.lat, lng: location.lng }, currentSettings);
      if (generated.length === 0) return;

      setNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        const merged = [...generated.filter((n) => !existingIds.has(n.id)), ...prev];
        setStoredNotifications(merged);
        return merged;
      });
    } catch {
      // 알림 갱신 실패는 조용히 무시한다 (핵심 지도 탐색 기능에 영향 없음)
    }
  }, []);

  useEffect(() => {
    const storedSettings = getStoredNotificationSettings();
    setSettings(storedSettings);
    setNotifications(getStoredNotifications());
    refreshNotifications(storedSettings);
  }, [refreshNotifications]);

  function handleToggleOpen() {
    setIsOpen((open) => {
      const next = !open;
      if (next) {
        setView('list');
        refreshNotifications(settings);
      }
      return next;
    });
  }

  function handleSettingsChange(next: NotificationSettings) {
    setSettings(next);
    setStoredNotificationSettings(next);
    refreshNotifications(next);
  }

  function handleSelectNotification(notification: NotificationItem) {
    const next = notifications.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n));
    setNotifications(next);
    setStoredNotifications(next);
    setIsOpen(false);
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label="알림"
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-lg hover:bg-gray-100"
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-100 z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">알림함</h2>
              <button
                type="button"
                onClick={() => setView((v) => (v === 'list' ? 'settings' : 'list'))}
                aria-label="알림 설정"
                className="text-gray-400 hover:text-gray-600"
              >
                {view === 'list' ? '⚙️' : '✕'}
              </button>
            </div>

            {view === 'settings' ? (
              <NotificationSettingsForm settings={settings} onChange={handleSettingsChange} />
            ) : (
              <NotificationList notifications={notifications} onSelect={handleSelectNotification} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
