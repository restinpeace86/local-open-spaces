'use client';

import { useEffect, useState } from 'react';
import { isPushSupported } from '@/lib/push/subscribe';
import { isSubscribedToEventReminder, subscribeToEventReminder, unsubscribeFromEventReminder } from '@/lib/push/event-reservation-reminder';

// [예약 오픈 알림](2026-09-20 사용자 지시): "사전예약 오픈일에 맞추어.. 예약 오픈 전
// 10분전이라던가 앱 푸시 주는 기능을 만들고 싶은데" — 이벤트 상세(DetailModal EVENT
// 분기)에서만 쓰인다. 관리자가 next_reservation_open_at을 입력해 둔 이벤트에만 이
// 버튼을 보여준다(값이 없거나 이미 지난 시각이면 아무것도 렌더링하지 않음).
function formatOpenAt(iso: string): string {
  const date = new Date(iso);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()}(${weekday}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventReservationReminderButton({ eventId }: { eventId: string }) {
  const [nextOpenAt, setNextOpenAt] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const supported = isPushSupported();

  useEffect(() => {
    let cancelled = false;
    setNextOpenAt(null);
    fetch(`/api/events/reservation-open-at?event_id=${encodeURIComponent(eventId)}`)
      .then((res) => res.json())
      .then((data: { next_reservation_open_at?: string | null }) => {
        if (!cancelled) setNextOpenAt(data.next_reservation_open_at ?? null);
      })
      .catch(() => {
        if (!cancelled) setNextOpenAt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!nextOpenAt || !supported) return;
    let cancelled = false;
    isSubscribedToEventReminder(eventId).then((value) => {
      if (!cancelled) setIsSubscribed(value);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, nextOpenAt, supported]);

  if (!nextOpenAt || new Date(nextOpenAt).getTime() <= Date.now()) return null;
  if (!supported) return null;

  async function handleToggle() {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      if (isSubscribed) {
        await unsubscribeFromEventReminder(eventId);
        setIsSubscribed(false);
      } else {
        await subscribeToEventReminder(eventId);
        setIsSubscribed(true);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '처리에 실패했습니다.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-1.5 rounded-xl border border-amber-100 bg-amber-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-amber-900">🔔 예약 오픈 알림</p>
          <p className="mt-0.5 text-xs text-amber-700">{formatOpenAt(nextOpenAt)} 예약 오픈 10분 전에 알려드려요.</p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isBusy}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            isSubscribed ? 'bg-amber-600 text-white' : 'bg-white text-amber-700'
          }`}
        >
          {isSubscribed ? '신청됨' : '알림 신청'}
        </button>
      </div>
      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
    </div>
  );
}
