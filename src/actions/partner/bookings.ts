'use server';

import { createClient } from '@/lib/supabase/server';

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): "예약 상태를 변경할 수
// 있는 간단한 토글... 즉시 DB 반영(Server Action)". onboarding.ts와 동일한 관례
// (제5장 제4조) — 세션 기반 클라이언트(createClient(), service_role 아님)를 써서
// RLS(bookings_update_own, auth.uid() = partner_id)가 그대로 적용되게 한다. 다른
// 파트너의 예약 id를 넘겨도 RLS가 걸러내 0건 갱신으로 끝난다(별도 소유권 검증 코드
// 불필요 — DB가 이미 강제).
export const BOOKING_STATUSES = ['confirmed', 'completed', 'noshow', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type UpdateBookingStatusResult = { error: string } | { success: true };

export async function updateBookingStatus(bookingId: string, status: BookingStatus): Promise<UpdateBookingStatusResult> {
  if (!BOOKING_STATUSES.includes(status)) {
    return { error: `status는 다음 중 하나여야 합니다: ${BOOKING_STATUSES.join(', ')}` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
  if (error) return { error: error.message };

  return { success: true };
}
