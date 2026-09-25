'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { BOOKING_STATUSES, BookingStatus } from '@/lib/partner/booking-status';

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): "예약 상태를 변경할 수
// 있는 간단한 토글... 즉시 DB 반영(Server Action)". onboarding.ts와 동일한 관례
// (제5장 제4조) — 세션 기반 클라이언트(createClient(), service_role 아님)를 써서
// RLS(bookings_update_own, auth.uid() = partner_id)가 그대로 적용되게 한다. 다른
// 파트너의 예약 id를 넘겨도 RLS가 걸러내 0건 갱신으로 끝난다(별도 소유권 검증 코드
// 불필요 — DB가 이미 강제).
// [2026-09-21 버그 수정] BOOKING_STATUSES/BookingStatus는 더 이상 이 파일이 정의/export
// 하지 않는다 — src/lib/partner/booking-status.ts 참고('use server' 파일은 async 함수만
// export해야 클라이언트에서 값이 깨지지 않음). 이 파일은 서버 로직에서만 값을 쓴다.

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

// [나드리픽 파트너 PMS — 수기 예약 등록](2026-09-20 사용자 지시, 2026-09-21
// "네이버 예약 호환 수동 예약 등록 폼" 요청으로 필드 확장): "파트너가 직접
// 전화/방문 예약을 등록할 수 있는 기능". source는 항상 'manual'(수기 등록 자체가
// 네이버 예약이 아니라는 뜻 — 2026-09-21 요청 전까지는 'nadripik'이라는 이름을
// 썼으나, 같은 개념에 두 이름이 남는 걸 피하려고 이번 요청이 명시한 'manual'로
// 통일했다. 기존 데이터/체크 제약도 함께 마이그레이션함:
// scripts/migrations/2026-09-21-bookings-manual-fields-and-source-rename.sql),
// status는 항상 'confirmed'로 고정한다(요구사항 원문).
export type CreateBookingInput = {
  customer_name: string;
  customer_phone: string;
  // [session_id 추가](2026-09-25 사용자 지시): "상품에 대하여 시간도 세팅가능하게
  // 하는건?" — time_mode='session' 상품을 고르면 booking_date/booking_time을
  // 자유 입력하지 않고 회차(session_id)를 선택한다. 둘 중 하나만 채워진다
  // (session_id가 있으면 booking_date/booking_time은 무시하고 회차에서 그대로
  // 가져온다) — free 모드는 기존과 동일하게 booking_date/booking_time을 쓴다.
  booking_date: string | null; // "YYYY-MM-DD", free 모드에서만 사용
  booking_time: string | null; // "HH:MM", free 모드에서만 사용
  session_id: string | null; // session 모드에서만 사용
  headcount: number;
  memo: string | null;
  // [2026-09-21 필드 확장] 네이버 예약 표준 매핑에 맞춰 추가 — 둘 다 선택 입력
  // (요구사항에 필수 표시가 없고, 전화로 대략적인 예약만 먼저 잡는 경우 상품명/
  // 금액을 나중에 채우는 흐름도 자연스럽다).
  product_name: string | null;
  total_price: number | null;
};

export type CreateBookingResult = { error: string } | { success: true };

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

// [2026-09-21] "010-XXXX-XXXX 형식 검증" 요구사항 — formatPhoneNumber가 입력
// 중 자동으로 하이픈을 넣어주긴 하지만(3-3-4/3-4-4), 서버 액션은 클라이언트를
// 신뢰하지 않고 최종 형태를 다시 검증한다. 서울 02 등 지역번호(2~3자리)도 있어
// 010 고정이 아니라 일반적인 국내 전화번호 하이픈 형식으로 검증한다(완전한
// 국번 규칙까지는 다루지 않음 — format-phone.ts와 동일하게 추측 금지).
const PHONE_FORMAT_REGEX = /^\d{2,3}-\d{3,4}-\d{4}$/;

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  if (isBlank(input.customer_name)) return { error: '예약자명을 입력해 주세요.' };
  if (isBlank(input.customer_phone)) return { error: '연락처를 입력해 주세요.' };
  if (!PHONE_FORMAT_REGEX.test(input.customer_phone.trim())) {
    return { error: '연락처 형식이 올바르지 않아요. 010-0000-0000 형식으로 입력해 주세요.' };
  }
  if (!Number.isInteger(input.headcount) || input.headcount < 1) return { error: '방문 인원은 1명 이상이어야 합니다.' };
  if (input.total_price != null && (!Number.isInteger(input.total_price) || input.total_price < 0)) {
    return { error: '결제 금액은 0 이상의 숫자로 입력해 주세요.' };
  }
  // [회차 예약 시 형식 검증 순서](2026-09-25 사용자 지시 반영): free 모드의 날짜/시간
  // 형식 검증은 로그인 확인보다 먼저 한다(기존 검증 순서 유지) — session 모드는
  // 날짜/시간을 회차에서 가져오므로 여기서 검증하지 않고 로그인 이후 회차 조회
  // 단계에서 존재 여부를 확인한다.
  if (!input.session_id) {
    if (!input.booking_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.booking_date)) return { error: '예약 날짜를 선택해 주세요.' };
    if (!input.booking_time || !/^\d{2}:\d{2}$/.test(input.booking_time)) return { error: '예약 시간을 선택해 주세요.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  let bookingDate: string;
  let bookingTime: string;

  if (input.session_id) {
    // [회차 예약](2026-09-25 사용자 지시): time_mode='session' 상품은 선택된 회차의
    // 날짜/시작 시간을 그대로 booking_date/booking_time으로 채운다 — BookingCard/
    // today 페이지의 리스트 정렬·표시 로직이 이 두 컬럼만 보고 동작하므로, 회차를
    // 도입해도 기존 화면 코드를 전혀 바꾸지 않아도 된다(제5장 제4조 기존 구조 우선).
    const { data: session, error: sessionError } = await supabase
      .from('product_sessions')
      .select('session_date, start_time, capacity')
      .eq('id', input.session_id)
      .single();
    if (sessionError || !session) return { error: '선택한 회차를 찾을 수 없어요.' };

    // [정원 검증](2026-09-25 사용자 지시 반영): 예약 등록 폼을 열어둔 사이 다른
    // 예약이 먼저 들어와 정원이 찼을 수 있어, 저장 직전에 서버에서 다시 확인한다
    // — UI가 미리 보여준 잔여석은 참고용이고 최종 검증은 여기서 한다.
    const { data: bookedRows, error: bookedError } = await supabase
      .from('bookings')
      .select('headcount')
      .eq('session_id', input.session_id)
      .neq('status', 'cancelled');
    if (bookedError) return { error: bookedError.message };
    const booked = (bookedRows ?? []).reduce((sum, row) => sum + row.headcount, 0);
    if (booked + input.headcount > session.capacity) {
      return { error: `이 회차는 ${Math.max(session.capacity - booked, 0)}자리만 남아 있어요.` };
    }

    bookingDate = session.session_date;
    bookingTime = session.start_time;
  } else {
    // input.booking_date/booking_time 형식은 위에서 이미 검증했다.
    bookingDate = input.booking_date as string;
    bookingTime = `${input.booking_time}:00`;
  }

  const { error } = await supabase.from('bookings').insert({
    // [멀티 테넌시](spec.md 4절): "세션의 auth.uid()를 추출하여 partner_id로 자동
    // 주입" — 클라이언트가 partner_id를 보낼 수 없게 애초에 입력 타입에서 뺐다.
    partner_id: user.id,
    customer_name: input.customer_name.trim(),
    customer_phone: input.customer_phone.trim(),
    booking_date: bookingDate,
    booking_time: bookingTime,
    session_id: input.session_id,
    headcount: input.headcount,
    source: 'manual',
    status: 'confirmed',
    memo: input.memo?.trim() || null,
    product_name: input.product_name?.trim() || null,
    total_price: input.total_price,
  });
  if (error) return { error: error.message };

  // [즉시 새로고침](요구사항 3): 일간 뷰가 이 액션과 별도로 서버에서 매번 새로
  // 조회하는 동적 라우트이긴 하지만, "Revalidate"를 명시적으로 지시받았으므로
  // 캐시 계층과 무관하게 확실히 무효화한다 — 실제 화면 갱신은 클라이언트 쪽에서
  // 이어서 호출하는 router.refresh()가 담당한다(BookingCard의 상태 변경과 동일한
  // 관례).
  revalidatePath('/partner/today');

  return { success: true };
}

// [파트너 예약 삭제](2026-09-22 사용자 지시): "각 계정 파트너 사장님도 자기꺼는 앱에서
// 삭제할수 있어야하고" — updateBookingStatus와 동일하게 세션 기반 클라이언트를 써서
// RLS(bookings_delete_own, auth.uid() = partner_id)가 소유권을 강제하게 한다. 다른
// 파트너의 예약 id를 넘겨도 RLS가 걸러내 0건 삭제로 끝난다.
export type DeleteBookingResult = { error: string } | { success: true };

export async function deleteBooking(bookingId: string): Promise<DeleteBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
  if (error) return { error: error.message };

  revalidatePath('/partner/today');
  return { success: true };
}
