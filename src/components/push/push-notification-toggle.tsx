'use client';

import { useEffect, useState } from 'react';
import { useUserLocation } from '@/hooks/use-user-location';
import { isPushSupported, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from '@/lib/push/subscribe';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.5: 우수맘 이상 전용
// "맞춤형 큐레이션 푸시 알람" 켜기/끄기 토글. 호출부(my-page-view.tsx)가 이미
// canReceivePushNotifications(profile.grade)로 우수맘 이상만 이 컴포넌트를 렌더링하므로,
// 여기서는 등급을 다시 확인하지 않는다.
export function PushNotificationToggle() {
  const { center } = useUserLocation();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const supported = isPushSupported();

  useEffect(() => {
    if (!supported) return;
    isSubscribedToPush().then(setIsSubscribed);
  }, [supported]);

  async function handleToggle() {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      if (isSubscribed) {
        await unsubscribeFromPush();
        setIsSubscribed(false);
      } else {
        await subscribeToPush(center);
        setIsSubscribed(true);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '처리에 실패했습니다.');
    } finally {
      setIsBusy(false);
    }
  }

  if (!supported) {
    return <p className="text-xs text-gray-400">이 브라우저는 푸시 알림을 지원하지 않아요.</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-amber-900">🌳 우수맘 맞춤 푸시 알람</p>
          <p className="mt-0.5 text-xs text-amber-700">우리 동네에 새로운 스팟/행사가 올라오면 알려드려요.</p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isBusy}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            isSubscribed ? 'bg-amber-600 text-white' : 'bg-white text-amber-700'
          }`}
        >
          {isSubscribed ? '알림 켜짐' : '알림 켜기'}
        </button>
      </div>
      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
    </div>
  );
}
