import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// [Decision 018](2026-09-02): 일반 사용자 소셜 로그인 도입에 따른 필수 인프라 — Supabase의
// @supabase/ssr 쿠키 기반 세션은 매 요청마다 액세스 토큰을 갱신해줘야 한다(공식 문서 권장
// 패턴). 이 미들웨어가 없으면 액세스 토큰이 만료된 뒤에도 브라우저 쿠키가 갱신되지 않아,
// 로그인은 됐는데 얼마 뒤 서버 컴포넌트/라우트 핸들러에서 세션이 끊겨 보이는 문제가 생긴다
// (Supabase Auth Next.js App Router 공식 가이드에 명시된 필수 단계 — 임의 추가가 아니다).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser()는 필요 시 토큰을 자동으로 갱신하고, 위 setAll 콜백을 통해 갱신된 쿠키를
  // 응답에 실어 보낸다 — 반환값 자체는 여기서 쓰지 않지만 호출 자체가 갱신을 유발한다.
  await supabase.auth.getUser();

  return response;
}

// 정적 자산/이미지 요청에는 굳이 세션 갱신 로직을 태우지 않는다(공식 가이드 예시 그대로).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
