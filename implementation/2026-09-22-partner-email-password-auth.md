# [개선사항 5] PMS 파트너 센터 이메일(ID/PW) 로그인/회원가입 추가

## 구현 대상
todo.md [개선사항 5]: 카카오/구글 소셜 로그인만 있던 `/partner/login`에
이메일/비밀번호 로그인·회원가입을 추가. 온보딩 스크롤 버그(개선사항 4)와
HQ 관리자 제한(goodguy10r@naver.com만)은 이미 이전 작업에서 완료됨.

## 사전 실측 (Supabase Auth 프로젝트 설정 — Management API로 직접 조회, 추측 금지)
- `password_min_length: 6`
- `mailer_autoconfirm: false` — 회원가입 직후 세션이 오지 않고, 이메일의
  확인 링크를 눌러야 로그인 가능.
- `smtp_host: null`(커스텀 SMTP 미설정) → Supabase 기본 메일 발송 한도
  (`rate_limit_email_sent`, 실측 시간당 2건) 적용 — **실제로 회원가입 폼을
  두 번 테스트하다 "email rate limit exceeded" 에러를 직접 재현**했다(아래
  참고).

## 변경 사항
### `src/components/partner/email-auth-form.tsx` (신규)
`PartnerEmailAuthForm` — 로그인/회원가입 탭 토글 + 이메일/비밀번호 입력 +
제출.
- 클라이언트 검증: 이메일 형식(정규식), 비밀번호 6자 이상(Supabase 설정과
  동일한 기준) — `noValidate`로 브라우저 기본 유효성 검사 팝업을 끄고 이
  폼의 한국어 에러 메시지로 통일했다.
- 로그인: `supabase.auth.signInWithPassword()` → 성공 시 `/partner/today`로
  이동(파트너 행이 없는 신규 계정은 기존 미들웨어가 자동으로 온보딩으로
  되돌려보냄 — 소셜 로그인과 동일한 분기 로직, 별도 처리 불필요).
- 회원가입: `supabase.auth.signUp()` → `mailer_autoconfirm=false`라 성공해도
  `data.session`이 없으면(정상 케이스) "가입 확인 이메일을 보냈어요" 안내 후
  로그인 탭으로 전환 — 세션이 있으면(설정이 바뀐 경우 대비) 바로 이동.
- 에러 메시지 한국어 번역: "Invalid login credentials", "User already
  registered", "Password should be at least...", "Email not confirmed",
  그리고 **실측으로 발견한 "email rate limit exceeded"**까지 5종.

### `src/app/partner/login/page.tsx`
소셜 로그인 버튼 아래에 "또는" 구분선 + `PartnerEmailAuthForm` 추가. 콘텐츠가
길어지면서 작은 화면에서 넘칠 수 있어(온보딩과 동일한 원인 — 루트 레이아웃의
고정 높이+overflow-hidden body), 이 페이지도 미리 `h-dvh`(고정) →
`flex-1 overflow-y-auto`(자체 스크롤)로 바꿨다.

### HQ 관리자 제한 — 추가 작업 불필요
"goodguy10r@naver.com만 관리자로 들어갈 수 있게"는 앞선 세션 작업
(`src/lib/hq/is-hq-staff.ts`)에서 이미 완료돼 있다. HQ 권한 검사는 로그인
수단과 무관하게 세션의 `user.email`만 보므로, 이 폼으로 로그인해도
`goodguy10r@naver.com`이면 동일하게 적용된다 — 실제로 실측 검증에서도 별도
분기 없이 그대로 통과함을 확인.

## 검증
- `npx tsc --noEmit` / `npm run test`(198개 파일 2280개, 신규 10개 —
  모드 전환/유효성 검증/로그인 성공·실패/회원가입 성공(이메일 확인 필요·즉시
  세션 두 경우)/이메일 발송 한도 에러/중복 가입 에러) / `npm run build`
  모두 통과.
- **실제 브라우저 + 실제 Supabase Auth 검증**(Playwright, mock 없이 진짜
  API 호출):
  1. 실제 회원가입 시도 중 **"email rate limit exceeded"를 실제로
     재현**했다 — 위 사전 실측이 예견한 그대로. 이 에러를 위 번역 목록에
     추가하는 계기가 됐다(추측이 아니라 실측으로 발견 후 대응).
  2. 이메일 확인이 완료된 테스트 계정(관리자 API로 생성, 회원가입 이메일
     발송 없이)으로 로그인 경로를 검증: 틀린 비밀번호 → "이메일 또는
     비밀번호가 올바르지 않습니다" 정상 표시, URL 이동 없음. 올바른
     비밀번호 → **실제 Supabase Auth 세션이 발급되고 `/partner/onboarding`
     으로 정상 이동**(신규 계정이라 partners 행 없음 → 미들웨어가 올바르게
     분기), 스크린샷으로 온보딩 폼이 정상 렌더링됨을 확인. 테스트 계정은
     검증 후 삭제.

## 특이 사항 — 사용자에게 알려야 할 실측 리스크
**이 프로젝트 Supabase는 커스텀 SMTP가 설정돼 있지 않아, 회원가입 확인
이메일 발송이 시간당 2건으로 제한된다**(Supabase 공유 메일 서버의 기본
한도, 실측 재현 완료). 실제 서비스 오픈 후 여러 사장님이 짧은 시간에
회원가입을 시도하면 3번째부터는 확인 이메일이 아예 발송되지 않고 "이메일
발송 요청이 많아 잠시 제한됐어요" 에러만 보게 된다 — 코드로 해결할 수 있는
범위가 아니라(외부 인프라 설정), Supabase 프로젝트에 커스텀 SMTP(예: Resend
— 이 프로젝트가 이미 다른 용도로 Resend API 키를 갖고 있음, `EMAIL_FROM_ADDRESS`
등 참고)를 연결하는 게 필요할 수 있다는 점을 알려드린다.
