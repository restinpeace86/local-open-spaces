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
  booking_date: string; // "YYYY-MM-DD"
  booking_time: string; // "HH:MM"
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.booking_date)) return { error: '예약 날짜를 선택해 주세요.' };
  if (!/^\d{2}:\d{2}$/.test(input.booking_time)) return { error: '예약 시간을 선택해 주세요.' };
  if (!Number.isInteger(input.headcount) || input.headcount < 1) return { error: '방문 인원은 1명 이상이어야 합니다.' };
  if (input.total_price != null && (!Number.isInteger(input.total_price) || input.total_price < 0)) {
    return { error: '결제 금액은 0 이상의 숫자로 입력해 주세요.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('bookings').insert({
    // [멀티 테넌시](spec.md 4절): "세션의 auth.uid()를 추출하여 partner_id로 자동
    // 주입" — 클라이언트가 partner_id를 보낼 수 없게 애초에 입력 타입에서 뺐다.
    partner_id: user.id,
    customer_name: input.customer_name.trim(),
    customer_phone: input.customer_phone.trim(),
    booking_date: input.booking_date,
    booking_time: `${input.booking_time}:00`,
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
