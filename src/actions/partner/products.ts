'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { PricingUnit, PRICING_UNITS } from '@/lib/partner/pricing-unit';
import { TimeMode, TIME_MODES } from '@/lib/partner/time-mode';

// [파트너 상품 관리](2026-09-23 사용자 지시): "더보기에서 화면 하나 만들어서 세팅할 수
// 있게해놓고 거기있는 데이터 가져와서 리스트로 나오게 하고 그중 선택하게해" —
// onboarding.ts/bookings.ts와 동일한 관례(제5장 제4조): 세션 기반 클라이언트로
// RLS(partner_products_*_own, auth.uid() = partner_id)가 소유권을 강제하게 한다.
// [PRICING_UNITS/PricingUnit 분리](2026-09-23): booking-status.ts와 동일한 이유로
// src/lib/partner/pricing-unit.ts로 옮겼다 — 'use server' 파일은 async 함수만
// export해야 클라이언트에서 값이 깨지지 않는다(상세 사유는 그 파일 주석 참고).
// [time_mode 추가](2026-09-25 사용자 지시): "상품에 대하여 시간도 세팅가능하게 하는건?"
// — 상품마다 시간을 자유 입력(free)으로 둘지, 미리 정해둔 회차(session) 중에서만
// 고르게 할지 선택한다. 회차 자체의 CRUD는 별도 액션(sessions.ts)에서 다룬다.
export type PartnerProductInput = {
  name: string;
  price: number;
  pricing_unit: PricingUnit;
  time_mode: TimeMode;
};

export type PartnerProductActionResult = { error: string } | { success: true };

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function validateInput(input: PartnerProductInput): string | null {
  if (isBlank(input.name)) return '상품명을 입력해 주세요.';
  if (!Number.isInteger(input.price) || input.price < 0) return '가격은 0 이상의 숫자로 입력해 주세요.';
  if (!PRICING_UNITS.includes(input.pricing_unit)) return '가격 기준이 올바르지 않습니다.';
  if (!TIME_MODES.includes(input.time_mode)) return '시간 세팅 방식이 올바르지 않습니다.';
  return null;
}

export async function createPartnerProduct(input: PartnerProductInput): Promise<PartnerProductActionResult> {
  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('partner_products').insert({
    partner_id: user.id,
    name: input.name.trim(),
    price: input.price,
    pricing_unit: input.pricing_unit,
    time_mode: input.time_mode,
  });
  if (error) return { error: error.message };

  revalidatePath('/partner/more/products');
  revalidatePath('/partner/today');
  return { success: true };
}

export async function updatePartnerProduct(productId: string, input: PartnerProductInput): Promise<PartnerProductActionResult> {
  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('partner_products')
    .update({ name: input.name.trim(), price: input.price, pricing_unit: input.pricing_unit, time_mode: input.time_mode })
    .eq('id', productId);
  if (error) return { error: error.message };

  revalidatePath('/partner/more/products');
  revalidatePath('/partner/today');
  return { success: true };
}

export async function deletePartnerProduct(productId: string): Promise<PartnerProductActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('partner_products').delete().eq('id', productId);
  if (error) return { error: error.message };

  revalidatePath('/partner/more/products');
  revalidatePath('/partner/today');
  return { success: true };
}
