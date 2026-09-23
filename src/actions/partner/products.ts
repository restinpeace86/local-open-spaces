'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// [파트너 상품 관리](2026-09-23 사용자 지시): "더보기에서 화면 하나 만들어서 세팅할 수
// 있게해놓고 거기있는 데이터 가져와서 리스트로 나오게 하고 그중 선택하게해" —
// onboarding.ts/bookings.ts와 동일한 관례(제5장 제4조): 세션 기반 클라이언트로
// RLS(partner_products_*_own, auth.uid() = partner_id)가 소유권을 강제하게 한다.
export type PricingUnit = 'flat' | 'per_person';
export const PRICING_UNITS: readonly PricingUnit[] = ['flat', 'per_person'];

export type PartnerProductInput = {
  name: string;
  price: number;
  pricing_unit: PricingUnit;
};

export type PartnerProductActionResult = { error: string } | { success: true };

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function validateInput(input: PartnerProductInput): string | null {
  if (isBlank(input.name)) return '상품명을 입력해 주세요.';
  if (!Number.isInteger(input.price) || input.price < 0) return '가격은 0 이상의 숫자로 입력해 주세요.';
  if (!PRICING_UNITS.includes(input.pricing_unit)) return '가격 기준이 올바르지 않습니다.';
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
    .update({ name: input.name.trim(), price: input.price, pricing_unit: input.pricing_unit })
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
