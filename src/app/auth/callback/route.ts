import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// [Decision 018](2026-09-02): 카카오/구글 로그인 버튼(signInWithOAuth)의 redirectTo가
// 가리키는 콜백 라우트. Supabase가 OAuth 제공자 인증 완료 후 `?code=...`를 붙여 이
// 경로로 리다이렉트하면, 그 code를 실제 세션(쿠키)으로 교환한다 — 이 교환이 끝나야
// 로그인이 "완료"된 상태가 된다(그 전까지는 code만 있고 세션은 아직 없음).
// exchangeCodeForSession은 서버에서만 호출 가능하고(PKCE code_verifier가 쿠키에 있어야
// 함), createClient()가 쿠키를 실제로 쓰고 쓰도록 응답에 반영해야 하므로 Route Handler로
// 구현한다(클라이언트 컴포넌트에서는 이 교환을 할 수 없음).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 로그인 성공 후 원래 보던 화면으로 돌아가고 싶을 때를 위한 선택적 파라미터 —
  // 넘기지 않으면 마이페이지로 보낸다(로그인 진입점이 대부분 /my일 것이므로).
  const next = searchParams.get('next') ?? '/my';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[auth/callback] 세션 교환 실패:', error.message);
  }

  // code가 없거나 교환이 실패하면 에러를 알 수 있게 쿼리 파라미터로 표시해 로그인
  // 화면으로 돌려보낸다(추측으로 성공한 것처럼 보이게 하지 않음).
  return NextResponse.redirect(`${origin}/my?auth_error=1`);
}
