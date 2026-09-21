'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isHqStaffEmail } from '@/lib/hq/is-hq-staff';

// [HQ 전체 파트너 데이터 열람/삭제 권한](2026-09-22 사용자 지시): "관리자에 대하여는
// 기존 데이터 다 보여야하고 삭제할 수 있는 권한도 있어야돼" — HQ는 예약의 소유자
// (partner_id)가 아니라서 세션 기반 클라이언트로는 RLS(bookings_delete_own)가 막는다.
// middleware.ts가 이미 /hq/* 진입 시 이메일 화이트리스트를 검사하지만, 이 액션은
// 전체 고객 PII를 삭제하는 만크 미들웨어만 믿지 않고 여기서도 다시 한번 확인한다
// (defense in depth — 다른 액션 파일들과 달리 이 파일만 유일하게 소유자 검증이 아니라
// "전체 데이터 접근 권한" 검증이라 이중 확인의 가치가 크다).
export type DeleteBookingAsHqResult = { error: string } | { success: true };

export async function deleteBookingAsHq(bookingId: string): Promise<DeleteBookingAsHqResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isHqStaffEmail(user.email)) {
    return { error: 'HQ 권한이 없습니다.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.from('bookings').delete().eq('id', bookingId);
  if (error) return { error: error.message };

  revalidatePath('/hq');
  return { success: true };
}
