import { createClient } from '@/lib/supabase/client';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.5: 우수맘 이상 Web Push
// 구독 플로우. 브라우저 Notification/PushManager API를 직접 다루고, 구독 정보(endpoint/키)
// 저장은 클라이언트 세션으로 RLS를 통과해 본인 행만 CRUD한다(profiles/user_bookmarks와
// 동일 패턴).
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  // TS lib.dom.d.ts의 BufferSource는 ArrayBuffer(SharedArrayBuffer 아님)를 요구하는데
  // Uint8Array.from()의 반환 타입은 더 넓은 ArrayBufferLike라 직접 대입이 막힌다 —
  // 실제로는 항상 일반 ArrayBuffer이므로 타입만 좁혀준다.
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0))) as BufferSource;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function subscribeToPush(location: { lat: number; lng: number } | null): Promise<void> {
  if (!isPushSupported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.');

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error('푸시 알림 설정이 완료되지 않았습니다.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한이 거부되었습니다.');

  const registration = await navigator.serviceWorker.register('/sw.js');
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('구독 정보를 가져오지 못했습니다.');
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: userData.user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
  });
  // endpoint UNIQUE 제약 위반(이미 구독됨)은 정상 상태로 간주한다 — 같은 기기에서 다시
  // 눌러도 에러로 보이지 않게 한다.
  if (error && error.code !== '23505') throw new Error(`푸시 구독 저장 실패: ${error.message}`);
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  await supabase.from('push_subscriptions').delete().eq('user_id', userData.user.id).eq('endpoint', endpoint);
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription);
}
