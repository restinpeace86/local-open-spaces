import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// [실사용 버그 발견 및 수정](2026-09-20, 파트너 PMS Phase 1 작업 중 실측 확인): 이
// 파일은 원래 프로젝트 "진짜 루트"(D:\workspace\local-open-spaces\middleware.ts)에
// 있었다 — 하지만 이 프로젝트는 src/app 구조를 쓰고 있어, Next.js 공식 규칙상
// middleware.ts는 src/ 안에 있어야 실제로 인식된다(src 밖에 두면 조용히 무시됨,
// 에러 없이). dev 서버로 새 파트너 라우트 가드를 직접 확인하던 중 리다이렉트가
// 전혀 동작하지 않아 발견했다 — 즉 아래 세션 갱신 로직도 지금까지 한 번도 실제로
// 실행된 적이 없었다(2026-09-02 도입 이후 계속). src/ 안으로 옮기는 것만으로
// 이 파일 전체(세션 갱신 + 이번에 추가하는 파트너/HQ 가드)가 처음으로 정상 작동한다.
//
// [Decision 018](2026-09-02): 일반 사용자 소셜 로그인 도입에 따른 필수 인프라 — Supabase의
// @supabase/ssr 쿠키 기반 세션은 매 요청마다 액세스 토큰을 갱신해줘야 한다(공식 문서 권장
// 패턴). 이 미들웨어가 없으면 액세스 토큰이 만료된 뒤에도 브라우저 쿠키가 갱신되지 않아,
// 로그인은 됐는데 얼마 뒤 서버 컴포넌트/라우트 핸들러에서 세션이 끊겨 보이는 문제가 생긴다
// (Supabase Auth Next.js App Router 공식 가이드에 명시된 필수 단계 — 임의 추가가 아니다).
//
// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md): "로그인
// 페이지를 제외한 /partner/* 하위 경로 접근 시 Supabase Auth 세션 검증 및 권한 체크,
// 미인증 시 /partner/login으로 자동 리다이렉트" — 위 세션 갱신 로직 바로 뒤에 이어 붙인다
// (같은 supabase 클라이언트/응답 객체를 재사용해야 갱신된 쿠키가 리다이렉트 응답에도
// 실린다). /admin/*은 이미 이 코드베이스에서 인증 없는 콘텐츠 큐레이션 관리자 화면
// (data-grid/pipeline/reservations)이 쓰고 있어 경로가 충돌해, 신규 HQ(본사 운영진)
// 모듈은 사용자 확인 하에 /hq/*로 분리했다.
const PARTNER_LOGIN_PATH = '/partner/login';
const PARTNER_ONBOARDING_PATH = '/partner/onboarding';
// OAuth 콜백은 세션이 아직 만들어지기 "전" 단계라 이 경로만은 인증 검사 없이 통과시켜야
// 한다 — 여기서 막으면 로그인 자체가 영영 끝나지 않는다.
const PARTNER_PUBLIC_PATHS = [PARTNER_LOGIN_PATH, '/partner/auth/callback'];
const HQ_LOGIN_PATH = '/hq/login';

// 리다이렉트 응답은 NextResponse.redirect()로 새로 만들어야 하는데, 그러면 위
// setAll 콜백이 `response`에 실어둔 갱신된 세션 쿠키가 함께 안 딸려간다(별개의
// 응답 객체이므로) — 방치하면 토큰이 막 갱신된 시점에 로그인 화면으로 튕겨나가는
// 사용자가 갱신 결과를 못 받는 문제가 생길 수 있어, 리다이렉트할 때마다 명시적으로
// 복사한다.
function redirectPreservingCookies(url: URL, base: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  base.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

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
  // 응답에 실어 보낸다 — 아래 파트너/HQ 가드가 이 반환값(로그인 여부)을 그대로 쓴다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/partner') && !PARTNER_PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (!user) {
      return redirectPreservingCookies(new URL(PARTNER_LOGIN_PATH, request.url), response);
    }
    // [권한 분리(Role-Based Access)](spec.md 3절): "해당 계정이 승인된 농장 공급자
    // 권한을 보유했는지 검증" — partners.id는 auth.users.id와 1:1이라 존재 여부만
    // 확인하면 된다. 온보딩 화면 자체로 가는 요청은 이 체크에서 제외해야(무한 리다이렉트
    // 방지) partners 행이 아직 없는 신규 로그인 사용자가 그 화면에 도달할 수 있다.
    if (!pathname.startsWith(PARTNER_ONBOARDING_PATH)) {
      const { data: partner } = await supabase.from('partners').select('id').eq('id', user.id).maybeSingle();
      if (!partner) {
        return redirectPreservingCookies(new URL(PARTNER_ONBOARDING_PATH, request.url), response);
      }
    }
  }

  if (pathname.startsWith('/hq') && pathname !== HQ_LOGIN_PATH) {
    // [본사 운영진 라우트 뼈대](spec.md 2절/9절): 현재는 로그인 여부만 확인한다 — "본사
    // 운영진 계정"을 식별할 테이블/방식이 아직 정해지지 않아(추측 금지) 역할 검증은
    // HQ 대시보드 기능을 실제로 붙이는 다음 단계에서 별도로 설계한다.
    if (!user) {
      return redirectPreservingCookies(new URL(HQ_LOGIN_PATH, request.url), response);
    }
  }

  return response;
}

// 정적 자산/이미지 요청에는 굳이 세션 갱신 로직을 태우지 않는다(공식 가이드 예시 그대로).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
