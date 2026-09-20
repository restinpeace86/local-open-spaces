import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 9절):
// hq-login-page의 콜백. 아직 "본사 운영진 계정" 식별 테이블/방식이 없어(추측 금지)
// 로그인 성공 여부만 확인하고 대시보드로 보낸다 — 실제 역할 검증(누가 진짜 HQ
// 직원인지)은 그 식별 방식이 정해지는 다음 단계에서 middleware.ts에 추가한다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/hq`);
    }
    console.error('[hq/auth/callback] 세션 교환 실패:', error.message);
  }

  return NextResponse.redirect(`${origin}/hq/login?auth_error=1`);
}
