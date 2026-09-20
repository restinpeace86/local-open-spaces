import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 3절):
// KakaoLoginButton/GoogleLoginButton의 callbackPath="/partner/auth/callback"이 가리키는
// 콜백 라우트. 기존 src/app/auth/callback/route.ts(일반 유저, profiles 완성 여부 체크)와
// 동일한 code-교환 패턴이지만, 완성 여부를 확인하는 대상이 profiles가 아니라 partners다
// — 두 테이블이 완전히 분리돼 있어(spec.md "데이터가 섞이면 안 된다") 일반 유저 콜백을
// 그대로 재사용할 수 없다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // partners 행이 아직 없으면(최초 로그인) 온보딩(상호명/스팟 연동 입력)으로
      // 보내야 하지만, 그 판단은 미들웨어(middleware.ts)가 /partner/today 진입 시
      // 이미 동일한 조건으로 수행해 /partner/onboarding으로 되돌려보낸다 — 여기서
      // partners를 또 조회할 필요가 없다(제5장 제4조 기존 구조 우선, 미들웨어의
      // 판단을 신뢰해 중복 쿼리를 만들지 않음).
      return NextResponse.redirect(`${origin}/partner/today`);
    }
    console.error('[partner/auth/callback] 세션 교환 실패:', error.message);
  }

  return NextResponse.redirect(`${origin}/partner/login?auth_error=1`);
}
