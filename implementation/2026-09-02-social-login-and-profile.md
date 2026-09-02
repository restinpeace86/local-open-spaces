# [개발요청] Supabase Auth 기반 카카오/구글 소셜 로그인 및 프로필(birth_years) 연동

## 구현 일시
2026-09-02

## 배경
직전에 이 요청을 "제2장 제5조(단순함, 복잡한 가입 절차 없이)/Spec 부재/전체 세션에
걸친 무인증 아키텍처"와 상충한다고 판단해 스킵했다. 이후 사용자가
`project/decision-log.md`에 **Decision 018**(일반 사용자 소셜 로그인 도입 승인,
"기존의 '무로그인 MVP' 정책을 수정")을, `spec/common/auth-user-profile.md`에 Spec을
실제로 커밋해 원격에 반영했고, `git pull`로 두 문서의 존재를 직접 확인한 뒤 이 작업을
진행했다.

## 구현 내용

### 1. DB — `public.profiles` 테이블(`2026-09-02-create-profiles-table.sql`)
- `id uuid primary key references auth.users(id) on delete cascade`,
  `birth_years integer[] not null default '{}'`, `created_at`/`updated_at`.
- RLS 활성화 + 본인 행만 SELECT/INSERT/UPDATE/DELETE 가능한 4개 정책(Spec 원문
  "CRUD" 그대로) — 이 프로젝트에서 **유일하게** "로그인한 본인만" 접근 정책이 실제로
  붙은 테이블이다(기존 테이블들은 전부 "RLS 켜고 정책 없음 = service_role 전용"
  패턴이었음 — 로그인 자체가 없었기 때문).
- `auth.users` INSERT 트리거(`handle_new_user`)로 신규 가입 즉시 `profiles` 행을
  자동 생성한다(공식 Supabase 패턴 — 클라이언트가 "로그인 후 upsert"를 직접 하면
  경쟁 상태로 프로필 누락 위험이 있어 DB 트리거로 확정적으로 보장).
- 라이브 DB에 적용 완료, RLS/정책/트리거 존재를 `pg_class`/`pg_policies`/`pg_trigger`
  직접 조회로 확인. `database.types.ts`도 재생성해 반영(diff로 `profiles` 타입 추가만
  깔끔하게 들어간 것 확인).

### 2. 세션 인프라 — `middleware.ts`(신규)
- `@supabase/ssr` 공식 Next.js App Router 가이드의 필수 패턴 — 매 요청마다
  `supabase.auth.getUser()`를 호출해 만료 임박 액세스 토큰을 자동 갱신하고 갱신된
  쿠키를 응답에 반영한다. 이게 없으면 로그인 직후에는 잘 되다가 얼마 뒤 세션이
  끊긴 것처럼 보이는 문제가 생긴다(추측이 아니라 공식 문서가 명시한 필수 단계).

### 3. 로그인 버튼 컴포넌트
- `KakaoLoginButton`(`#FEE500` 배경, "카카오로 3초 만에 시작하기"),
  `GoogleLoginButton`("구글로 시작하기", 흰 배경+회색 테두리+4색 G 로고) — 요구사항
  원문 그대로 색상/문구 적용. 아이콘은 브랜드 가이드 근사 SVG다(정확한 픽셀 단위
  공식 자산이 필요하면 각 사 브랜드 리소스로 교체 권장 — 근사치임을 코드 주석에
  명시).
- 둘 다 `supabase.auth.signInWithOAuth({ provider, options: { redirectTo:
  \`${window.location.origin}/auth/callback\` } })`를 호출하고, `provider`만
  `'kakao'`/`'google'`로 다르다(요구사항 그대로).
- 에러 핸들링: `console.error` + `onError` 콜백 prop(둘 다) — 요구사항 "콘솔 또는
  UI 상에서 확인 가능"을 둘 다 만족.

### 4. 콜백 처리 — `src/app/auth/callback/route.ts`(신규)
- OAuth 제공자 인증 완료 후 Supabase가 `?code=...`를 붙여 리다이렉트하는 대상.
  `exchangeCodeForSession(code)`로 실제 세션(쿠키)을 확정한다 — 이 교환은
  PKCE code_verifier가 쿠키에 있어야 해 서버(Route Handler)에서만 가능하다.
  성공 시 `/my`(또는 `?next=`로 지정한 경로)로, 실패 시 `/my?auth_error=1`로
  리다이렉트해 실패를 숨기지 않는다.

### 5. 프로필 연동 — `src/lib/auth/profile.ts`, `src/hooks/use-user.ts`
- `getMyProfile()`: 비로그인 시 null(에러 아님), 로그인 시 본인 행 조회.
- `updateBirthYears(years)`: 본인 행의 `birth_years`만 갱신.
- `useUser()`: `onAuthStateChange` 구독으로 로그인/로그아웃이 즉시 UI에 반영되는
  클라이언트 훅.

### 6. 화면 — `/my`(신규) + 하단 탭 활성화
- 하단 탭 "마이"는 Task 9-6-10부터 "인증 시스템 부재"로 비활성화 상태였다
  (`bottom-tabs.tsx`) — Decision 018이 그 사유를 직접 해소했으므로
  `NEXT_PUBLIC_ENABLE_MY_PAGE=true`로 전환하고 실제 화면(`MyPageView`)을 구현했다:
  비로그인 시 로그인 버튼 2종, 로그인 시 이메일/로그아웃 + `BirthYearsEditor`
  (자녀 출생년도 추가/삭제/저장).
- "찜"/"방문 이력"은 Spec이 RLS 근거로만 언급했을 뿐 화면/데이터 구조가 정의돼
  있지 않아(제3장 제4조 추측 금지) 이번 범위에 포함하지 않았다.
- **주의**: `.env.local`에만 플래그를 켰다 — Vercel 프로덕션 환경에도 동일한
  `NEXT_PUBLIC_ENABLE_MY_PAGE=true`를 설정해야 배포 환경에서도 "마이" 탭이 열린다
  (로컬 설정만으로는 배포에 반영되지 않음).

## 실측으로 발견해 함께 고친 버그
`BirthYearsEditor`는 `initialBirthYears`를 `useState`의 초기값으로만 쓰는데, 프로필이
비동기로 늦게 로드되면(`profile`이 `null → {birth_years:[...]}`로 나중에 바뀜)
컴포넌트가 이미 빈 배열로 마운트된 뒤라 리액트가 리렌더만으로는 `useState` 초기값을
다시 계산해주지 않는다 — 로딩 상태 전환이 배치 처리로 인해 별도 커밋 없이 지나가버리면
(빠른 네트워크에서 실제 재현됨) 화면에 항상 빈 목록만 보이는 버그였다. `<BirthYearsEditor
key={profile ? 'loaded' : 'pending'} .../>`로 프로필 로드 여부에 따라 확실히
리마운트되게 해 해결했다 — 유닛 테스트로 먼저 재현한 뒤 고쳤다.

## 검증

### 코드 검증
`npx tsc --noEmit`/`npm run test`(92파일 916건 — 신규 5파일 27건)/`npm run build`
통과(`/auth/callback`, `/my`, 미들웨어 모두 정상 빌드).

### 실측 검증(실제 Supabase 프로젝트, 실제 Kakao/Google OAuth 앱, 실제 브라우저)
- Playwright: `/my`에서 카카오/구글 버튼 노출, 하단 탭 "마이"가 더 이상 비활성화가
  아니라 실제 버튼으로 렌더링됨을 확인.
- **카카오 버튼 클릭 → 실제로 `accounts.kakao.com/login`까지 이동**함을 확인(URL에
  실제 등록된 client_id·`redirect_uri=https://geffyjfnqrabovtmjcev.supabase.co/
  auth/v1/callback`·`redirect_to=http://localhost:3000/auth/callback`이 정확히
  포함됨 — Supabase 대시보드의 카카오 Provider 설정이 실제로 살아있음을 실증).
- **구글 버튌 클릭 → 실제로 `accounts.google.com/v3/signin/identifier`까지 이동**
  함을 동일하게 확인(등록된 client_id·동일한 redirect_uri/redirect_to 확인).
- anon 키로 `profiles` 직접 SELECT → 빈 배열(RLS로 타인 행 비공개 확인), 임의 INSERT
  시도 → 401 + RLS 위반 에러로 정확히 차단됨을 실측 확인.
- 미들웨어 추가 후 기존 페이지(`/`, `/nearby`, `/calendar`) 전부 정상 로드됨을
  확인(회귀 없음).

## 특이 사항
- 실제 카카오/구글 계정으로 로그인을 "완료"까지(동의 화면 통과 후 콜백 성공) 검증하는
  것은 실제 사용자 자격 증명이 필요해 이번 자동화 검증 범위에서는 OAuth "개시"까지만
  확인했다 — 콜백 라우트(`exchangeCodeForSession`)의 성공 경로는 코드 검토와 Supabase
  공식 패턴 준수로 신뢰하되, 실제 최초 로그인은 사용자가 브라우저로 한 번 시도해
  트리거가 `profiles` 행을 정상 생성하는지 확인해보길 권장한다.
- 로그인 버튼 아이콘(카카오 말풍선/구글 G)은 브랜드 가이드를 근사한 인라인 SVG다 —
  정확한 픽셀 단위 공식 자산이 필요하면 각 사 브랜드 리소스로 교체를 권장한다.
