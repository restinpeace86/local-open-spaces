'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// [나드리픽 파트너 PMS — 온보딩 페이지](2026-09-20 사용자 지시, docs/partner_spec.md):
// "폼 제출 시 실행되는 Server Action 구현" — 지시서가 메커니즘(Server Action)과
// 경로(src/actions/partner/onboarding.ts)를 명시적으로 지정해 그대로 따른다. 이
// 프로젝트는 지금까지 전부 Route Handler(src/app/api/**/route.ts)만 써왔지만
// (Server Action은 이번이 최초), 이건 "임의로 새 패턴을 고른 것"이 아니라 사용자가
// 직접 지정한 메커니즘이라 기존 관례보다 이 지시를 그대로 따른다.
//
// 이미지 업로드(/api/partner/upload-farm-image)는 파일 선택 즉시 별도로 먼저
// 처리해 URL만 이 액션에 넘긴다 — 다른 업로드 플로우(spot-curations-panel.tsx의
// 클립보드 붙여넣기 등)와 동일하게 "선택 즉시 업로드 → 완료된 URL만 최종 폼
// 제출에 포함" 관례를 따른다(제5장 제4조).
export type PartnerOnboardingInput = {
  farm_name: string;
  owner_name: string;
  phone: string;
  image_url: string | null;
  address: string;
  spot_id: string;
};

export type PartnerOnboardingResult = { error: string } | { success: true };

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export async function submitPartnerOnboarding(input: PartnerOnboardingInput): Promise<PartnerOnboardingResult> {
  // 요구사항 원문: 농장 이름/대표자 성함/연락처/주소/스팟 연동은 필수, 이미지는 선택.
  if (isBlank(input.farm_name)) return { error: '농장 이름을 입력해 주세요.' };
  if (isBlank(input.owner_name)) return { error: '대표자 성함을 입력해 주세요.' };
  if (isBlank(input.phone)) return { error: '연락처를 입력해 주세요.' };
  if (isBlank(input.address)) return { error: '농장 위치 주소를 입력해 주세요.' };
  if (isBlank(input.spot_id)) return { error: '나드리픽 스팟을 연동해 주세요.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 미들웨어(src/middleware.ts)가 이미 비로그인 사용자를 /partner/login으로 걸러내지만,
  // 서버 액션은 미들웨어와 별개 경로로도 직접 호출될 수 있어(제5장 제11조 오류 처리
  // 원칙) 여기서도 다시 한번 확인한다 — auth.uid()를 신뢰할 수 있어야 partners.id로
  // 그대로 쓸 수 있다.
  if (!user) return { error: '로그인이 필요합니다.' };

  // [멀티 테넌시](spec.md 4절): partners.id는 auth.users.id와 1:1 — 현재 로그인한
  // 유저 본인 행만 upsert한다(RLS partners_insert_own/partners_update_own이 이미
  // auth.uid() = id로 강제하므로, 다른 사람 id로 넣으려 해도 DB가 거부한다).
  const { error } = await supabase.from('partners').upsert(
    {
      id: user.id,
      farm_name: input.farm_name.trim(),
      owner_name: input.owner_name.trim(),
      phone: input.phone.trim(),
      image_url: input.image_url,
      address: input.address.trim(),
      spot_id: input.spot_id,
    },
    { onConflict: 'id' }
  );

  if (error) return { error: error.message };

  // [저장 완료 후 리다이렉트](요구사항 3): redirect()는 내부적으로 예외를 던져
  // Next.js 런타임이 처리하므로 이 뒤에 별도 return이 필요 없다.
  redirect('/partner');
}
