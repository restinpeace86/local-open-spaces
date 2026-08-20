'use client';

import { NotificationRadius, NotificationSettings } from '@/lib/notifications/notification-storage';

// spec/notification/notification-settings.md 3.1: radius 옵션 전체 목록
const RADIUS_OPTIONS: NotificationRadius[] = ['10km', '20km', '30km', 'all'];

// spec/notification/notification-settings.md 3.1: target_ages 예시값(infant/child)만 명시되어 있어
// 스펙에 없는 추가 연령대 태그를 임의로 만들지 않고 명시된 두 값만 선택지로 제공한다.
const AGE_TAG_OPTIONS: { value: string; label: string }[] = [
  { value: 'infant', label: '영유아' },
  { value: 'child', label: '아동' },
];

// spec/notification/notification-settings.md 4: 설정 변경 즉시 저장
export function NotificationSettingsForm({
  settings,
  onChange,
}: {
  settings: NotificationSettings;
  onChange: (next: NotificationSettings) => void;
}) {
  function toggleAge(value: string) {
    const nextAges = settings.target_ages.includes(value)
      ? settings.target_ages.filter((age) => age !== value)
      : [...settings.target_ages, value];
    onChange({ ...settings, target_ages: nextAges });
  }

  return (
    <div className="p-4 flex flex-col gap-4 text-sm">
      <label className="flex items-center justify-between">
        <span className="font-medium text-gray-800">맞춤 알림 받기</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
          className="w-4 h-4"
        />
      </label>

      <div>
        <p className="font-medium text-gray-800 mb-1.5">알림 반경</p>
        <div className="flex flex-wrap gap-1.5">
          {RADIUS_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange({ ...settings, radius: option })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                settings.radius === option
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option === 'all' ? '전체' : option}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="font-medium text-gray-800 mb-1.5">아이 연령대</p>
        <div className="flex flex-wrap gap-1.5">
          {AGE_TAG_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleAge(option.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                settings.target_ages.includes(option.value)
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between">
        <span className="font-medium text-gray-800">예약 마감 D-1 알림</span>
        <input
          type="checkbox"
          checked={settings.d_minus_one_alert}
          onChange={(e) => onChange({ ...settings, d_minus_one_alert: e.target.checked })}
          className="w-4 h-4"
        />
      </label>
    </div>
  );
}
