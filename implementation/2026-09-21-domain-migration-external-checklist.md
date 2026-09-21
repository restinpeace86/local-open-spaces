# [개선사항 1 후속] 커스텀 도메인 전환 — 외부 서비스 대시보드 점검 리스트

## 배경
사용자 요청(2026-09-21): "외부 우리가 반영해야 할게 어떤거 있는지 외부 환경
연동 코드들 보고 어떤 외부툴이나 환경과 연동되어있어서 거기를 점검해봐야하는지
리스트 남겨줘" — 코드 감사(`2026-09-21-custom-domain-migration-audit.md`)와
별개로, 코드에는 없지만 **외부 벤더 대시보드에 우리 도메인이 등록돼 있어서
도메인을 바꾸면 그쪽에서 거부/실패할 수 있는** 연동을 전수 조사했다.

## 🔴 반드시 확인/변경해야 하는 것 (2곳)

### 1. Supabase Auth — Redirect URLs 화이트리스트 (가장 중요, 안 하면 로그인 전체가 깨짐)
`kakao-login-button.tsx`/`google-login-button.tsx`가 `redirectTo:
window.location.origin + 콜백경로`로 로그인을 호출하는데, Supabase Auth(GoTrue)는
그 `redirectTo`가 **Supabase 대시보드 → Authentication → URL Configuration →
Redirect URLs**에 등록된 값과 정확히 일치해야만 콜백을 허용한다. 등록 안 된
도메인이면 로그인 자체가 아니라 **콜백 단계에서 조용히 실패**한다(사용자에게는
"로그인이 안 된다"로만 보여 원인 파악이 늦어지기 쉬움).
- **추가해야 할 값**: `https://nadri-pick.com/auth/callback`,
  `https://nadri-pick.com/partner/auth/callback`,
  `https://nadri-pick.com/hq/auth/callback`
- 기존 `*.vercel.app` 항목은 프리뷰 배포 테스트용으로 계속 남겨둬도 무방(굳이
  지울 필요 없음, 새 도메인 항목만 추가하면 됨).
- Kakao/Google 각 OAuth 앱 콘솔 쪽은 보통 영향 없음 — 거기 등록된 Redirect
  URI는 Supabase 자체의 고정 콜백(`https://<project>.supabase.co/auth/v1/callback`)
  이라 우리 앱 도메인과 무관하다.

### 2. Kakao Developers — Web 플랫폼 도메인 등록
`NEXT_PUBLIC_KAKAO_MAP_API_KEY`(Kakao Maps JS SDK, 브라우저에서 직접 로드)는
Kakao Developers 콘솔의 **내 애플리케이션 → 앱 설정 → 플랫폼 → Web 플랫폼**에
등록된 사이트 도메인에서만 동작한다. `https://nadri-pick.com`을 추가하지
않으면 새 도메인에서 지도가 아예 로드되지 않는다(콘솔 에러로만 나타남).

## 🟡 지금 당장은 아니지만 기억해 둘 것

### 3. Resend 발신 도메인 인증
`.env.local`에 이미 남겨둔 메모대로, `EMAIL_FROM_ADDRESS`는 아직 Resend
공유 테스트 도메인(`onboarding@resend.dev`)을 쓰고 있다. **다만 재조사 결과
실제 이메일 발송 기능(`src/lib/email/email-provider.ts` 등) 자체가 아직
코드로 구현되어 있지 않다** — 즉 지금은 영향이 없고, 나중에 실제 발송 기능을
붙일 때 Resend 대시보드에서 `nadri-pick.com`의 DKIM/SPF/TXT 레코드를
등록·인증하면 된다.

### 4. 클라우드플레어 Email Routing (이미 알고 있던 항목)
`/api/webhook/email-inbound`가 전제하는 `{inbound_token}@inbound.nadri-pick.com`
수신 주소를 실제로 쓰려면 클라우드플레어에서 그 서브도메인의 인바운드 라우팅
규칙을 설정해야 한다 — 이전 웹훅 구현 기록에서 이미 안내한 내용 그대로다.

## 🟢 도메인과 무관 — 아무것도 안 해도 되는 것
서버 전용 API 키라 브라우저 로드/리다이�렉트가 없어 벤더가 우리 도메인을
전혀 신경 쓰지 않는다: **Kakao REST API 키**(길찾기/장소검색, 서버 라우트
전용), **네이버 Client ID/Secret**(블로그 검색 API, 서버 전용), **VWorld/
공공데이터포털/서울열린데이터광장/경기데이터드림/농사로/마이리얼트립**(전부
ingest 스크립트·admin API의 서버 `fetch()` 호출), **VAPID 키**(비대칭
키쌍일 뿐 벤더 대시보드 자체가 없음), **Discord 웹훅**(순수 outbound,
Discord가 우리를 호출하지 않음). `KAKAO_ACCESS_TOKEN`은 실제 사용처가 코드에
없어 현재 미사용으로 보인다(별도 확인 불필요).

## 결론
실제로 벤더 대시보드에 들어가 손봐야 하는 건 **Supabase Redirect URLs**와
**Kakao Web 플랫폼 도메인** 딱 2곳이다. 이 둘을 놓치면 각각 "로그인 실패"와
"지도 안 뜸"이라는 눈에 띄는 장애로 바로 드러나니, 도메인 전환 당일 가장
먼저 확인하는 걸 권장한다.
