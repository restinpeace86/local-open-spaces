'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { todayKstDateString } from '@/lib/partner/date';

// [상품 회차(session) 관리](2026-09-25 사용자 지시): "상품에 대하여 시간도
// 세팅가능하게 하는건?" → "이 방식으로 구현들어가고" — time_mode='session'인
// 상품은 사장님이 미리 회차(날짜/시작/종료 시간/정원)를 등록해두고, 예약은 그중
// 하나를 골라 정원 안에서만 잡힌다. products.ts/bookings.ts와 동일한 관례
// (제5장 제4조): 세션 기반 클라이언트로 RLS(product_sessions_*_own,
// auth.uid() = partner_id)가 소유권을 강제하게 한다.
export type ProductSessionInput = {
  product_id: string;
  session_date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  end_time: string | null; // "HH:MM" | null
  capacity: number;
};

export type ProductSessionActionResult = { error: string } | { success: true };

function validateInput(input: ProductSessionInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.session_date)) return '회차 날짜를 선택해 주세요.';
  if (!/^\d{2}:\d{2}$/.test(input.start_time)) return '시작 시간을 선택해 주세요.';
  if (input.end_time != null && !/^\d{2}:\d{2}$/.test(input.end_time)) return '종료 시간 형식이 올바르지 않습니다.';
  if (!Number.isInteger(input.capacity) || input.capacity < 1) return '정원은 1명 이상이어야 합니다.';
  return null;
}

export async function createProductSession(input: ProductSessionInput): Promise<ProductSessionActionResult> {
  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('product_sessions').insert({
    product_id: input.product_id,
    partner_id: user.id,
    session_date: input.session_date,
    start_time: `${input.start_time}:00`,
    end_time: input.end_time ? `${input.end_time}:00` : null,
    capacity: input.capacity,
  });
  if (error) return { error: error.message };

  revalidatePath('/partner/more/products');
  revalidatePath('/partner/today');
  return { success: true };
}

export async function updateProductSession(sessionId: string, input: ProductSessionInput): Promise<ProductSessionActionResult> {
  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('product_sessions')
    .update({
      session_date: input.session_date,
      start_time: `${input.start_time}:00`,
      end_time: input.end_time ? `${input.end_time}:00` : null,
      capacity: input.capacity,
    })
    .eq('id', sessionId);
  if (error) return { error: error.message };

  revalidatePath('/partner/more/products');
  revalidatePath('/partner/today');
  return { success: true };
}

export async function deleteProductSession(sessionId: string): Promise<ProductSessionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('product_sessions').delete().eq('id', sessionId);
  if (error) return { error: error.message };

  revalidatePath('/partner/more/products');
  revalidatePath('/partner/today');
  return { success: true };
}

export type ManagedSession = {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  capacity: number;
  booked: number;
};

export type ListProductSessionsResult = { error: string } | { success: true; sessions: ManagedSession[] };

// [회차 관리 목록](2026-09-25 사용자 지시 반영): 상품 관리 화면에서 사장님이 등록한
// 회차 전체(지난 회차 포함)를 보여주기 위한 조회 — listAvailableSessionsForProduct
// (예약 등록 폼에서 "지금부터 고를 수 있는 회차"만 보여주는 것)와는 목적이 달라
// 날짜 필터를 두지 않는다. 예약 인원 합계도 동일하게 조회 시점에 계산한다.
export async function listProductSessions(productId: string): Promise<ListProductSessionsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: sessions, error: sessionsError } = await supabase
    .from('product_sessions')
    .select('id, session_date, start_time, end_time, capacity')
    .eq('product_id', productId)
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true });
  if (sessionsError) return { error: sessionsError.message };
  if (!sessions || sessions.length === 0) return { success: true, sessions: [] };

  const sessionIds = sessions.map((s) => s.id);
  const { data: bookedRows, error: bookingsError } = await supabase
    .from('bookings')
    .select('session_id, headcount')
    .in('session_id', sessionIds)
    .neq('status', 'cancelled');
  if (bookingsError) return { error: bookingsError.message };

  const bookedBySession = new Map<string, number>();
  for (const row of bookedRows ?? []) {
    if (!row.session_id) continue;
    bookedBySession.set(row.session_id, (bookedBySession.get(row.session_id) ?? 0) + row.headcount);
  }

  return {
    success: true,
    sessions: sessions.map((s) => ({ ...s, booked: bookedBySession.get(s.id) ?? 0 })),
  };
}

export type AvailableSession = {
  id: string;
  session_date: string;
  start_time: string; // "HH:MM:SS"
  end_time: string | null;
  capacity: number;
  remaining: number;
};

export type ListAvailableSessionsResult = { error: string } | { success: true; sessions: AvailableSession[] };

// [잔여 정원 조회](2026-09-25 사용자 지시 반영): 예약 추가 폼에서 회차를 고를 때
// "몇 자리 남았는지"를 보여주기 위한 조회. 별도 카운터 컬럼을 두지 않고 조회
// 시점에 계산한다(이 프로젝트가 이미 쓰는 "집계는 조회 시점에 계산" 원칙,
// aggregateBookingsByDay와 동일) — 취소(cancelled)된 예약은 정원을 차지하지
// 않는 것으로 본다. 오늘 이후(오늘 포함) 회차만 예약 등록 시 선택 가능하다.
export async function listAvailableSessionsForProduct(productId: string): Promise<ListAvailableSessionsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: sessions, error: sessionsError } = await supabase
    .from('product_sessions')
    .select('id, session_date, start_time, end_time, capacity')
    .eq('product_id', productId)
    .gte('session_date', todayKstDateString())
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true });
  if (sessionsError) return { error: sessionsError.message };
  if (!sessions || sessions.length === 0) return { success: true, sessions: [] };

  const sessionIds = sessions.map((s) => s.id);
  const { data: bookedRows, error: bookingsError } = await supabase
    .from('bookings')
    .select('session_id, headcount')
    .in('session_id', sessionIds)
    .neq('status', 'cancelled');
  if (bookingsError) return { error: bookingsError.message };

  const bookedBySession = new Map<string, number>();
  for (const row of bookedRows ?? []) {
    if (!row.session_id) continue;
    bookedBySession.set(row.session_id, (bookedBySession.get(row.session_id) ?? 0) + row.headcount);
  }

  return {
    success: true,
    sessions: sessions.map((s) => ({
      ...s,
      remaining: s.capacity - (bookedBySession.get(s.id) ?? 0),
    })),
  };
}
