import { createClient } from '@/lib/supabase/client';
import { subscribeToPush, isPushSupported } from './subscribe';

// [예약 오픈 알림](2026-09-20 사용자 지시): "사전예약 오픈일에 맞추어.. 예약 오픈 전
// 10분전이라던가 앱 푸시 주는 기능" — 구독 조건은 "로그인만 하면 누구나"로 확정했다
// (기존 나드리픽 푸시의 우수맘 등급 제한과 달리, 이 기능엔 그런 제한이 없다). 기존
// push_subscriptions(기기별 구독 정보)는 그대로 재사용하고, event_reservation_reminders
// 테이블에 "이 유저가 이 이벤트를 구독했는가"만 별도로 기록한다(subscribe.ts와 동일한
// 클라이언트 직접 RLS 패턴 — 서버 API 라우트를 따로 두지 않는다, 제5장 제4조).
export async function isSubscribedToEventReminder(eventId: string): Promise<boolean> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;

  const { data } = await supabase
    .from('event_reservation_reminders')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  return Boolean(data);
}

export async function subscribeToEventReminder(eventId: string): Promise<void> {
  if (!isPushSupported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.');

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  // 이미 이 기기의 푸시 구독이 있으면 subscribeToPush 내부에서 기존 구독을 그대로
  // 재사용하고(existing ?? subscribe), unique 제약 위반도 정상 상태로 처리한다.
  await subscribeToPush(null);

  const { error } = await supabase
    .from('event_reservation_reminders')
    .insert({ event_id: eventId, user_id: userData.user.id });
  // (event_id, user_id) UNIQUE 제약 위반(이미 신청됨)은 정상 상태로 간주한다.
  if (error && error.code !== '23505') throw new Error(`예약 오픈 알림 신청 실패: ${error.message}`);
}

export async function unsubscribeFromEventReminder(eventId: string): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  // 이 이벤트의 신청만 취소한다 — 기기의 푸시 구독 자체(다른 이벤트 알림에도 쓰일 수
  // 있음)는 건드리지 않는다.
  await supabase
    .from('event_reservation_reminders')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userData.user.id);
}
