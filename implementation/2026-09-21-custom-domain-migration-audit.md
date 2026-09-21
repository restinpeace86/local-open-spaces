# [개선사항 1] 커스텀 도메인 전환(vercel.app → nadri-pick.com) 코드베이스 감사

## 구현 대상
사용자 지시(`implementation/todo.md` [개선사항 1]): 도메인을 `vercel.app`에서
`https://nadri-pick.com`으로 바꾸기 위해 코드베이스 전체를 스캔하고, 수정이
필요한 파일/방향을 리스트업.

## 조사 결과 — "반드시 코드를 고쳐야 하는" 하드코딩은 없었다
1. **하드코딩된 도메인**: `.vercel.app` 리터럴이 실제 소스/설정 어디에도 없다
   (`implementation/*.md` 과거 작업 기록 문서에만 등장 — 코드에 영향 없음).
   `localhost`는 전부 안전한 용도(Kakao Maps 설정 안내 문서, `supabase/
   config.toml`의 주석 처리된 `rp_id`, 테스트 코드가 `new URL()` 파싱용으로
   쓰는 더미 값)뿐이었다.
2. **OAuth 리다이렉트**: `kakao-login-button.tsx`/`google-login-button.tsx`가
   전부 `window.location.origin`을 쓴다 — 이미 도메인 독립적이라 손댈 필요 없음.
3. **API/웹훅**: `next.config.ts`의 `images.remotePatterns`는 Supabase Storage
   도메인만 참조(무관). 최근 만든 두 웹훅(`naver-booking`/`email-inbound`)도
   자기 자신의 도메인을 코드에서 참조하지 않는다(인바운드 전용, 콜백 URL을
   스스로 구성하지 않음).
4. **유일한 실제 갭**: `src/app/layout.tsx`의 `metadata`에 `metadataBase`가
   아예 없었다. Next.js가 요청 헤더로 상대 경로를 추론해 대부분은 그냥
   동작하지만, OG 이미지/카카오톡 공유 미리보기처럼 서버가 미리 절대 URL을
   만들어야 하는 경우 배포 프리뷰 URL(`*.vercel.app`)이 새어 나갈 수 있다.

## 변경 사항
- `.env.local`: `NEXT_PUBLIC_SITE_URL=https://nadri-pick.com` 추가(Vercel
  프로덕션 환경변수에도 동일하게 등록 필요 — 기존 `NEXT_PUBLIC_ENABLE_MY_PAGE`
  등과 동일한 주의사항).
- `src/app/layout.tsx`: `metadata.metadataBase`를 이 값(없으면 실제 도메인
  리터럴로 폴백)으로 설정.
- 최근 세션에서 내가 직접 만든 문서/주석 3곳에 실수로 들어간 오타 도메인
  (`nadripik.com`, 하이픈 없음)을 실제 목표 도메인(`nadri-pick.com`)으로
  수정: `src/app/api/webhook/email-inbound/route.ts`,
  `scripts/migrations/2026-09-21-partners-inbound-token.sql`,
  `implementation/2026-09-21-partner-email-inbound-webhook.md`(둘 다 코드
  로직에는 영향 없는 예시 문자열/주석이었음 — DB의 실제 `comment on column`은
  애초에 일반화된 "인바운드도메인" 플레이스홀더라 고칠 게 없었다).

## 이번 범위에서 의도적으로 안 한 것
- `sitemap.ts`/`robots.ts`는 현재 아예 존재하지 않는다 — 이건 이번 도메인
  전환이 "고장 낸" 게 없어서(원래 없던 것) 새로 만들지 않았다. SEO 사이트맵
  자체는 별도 기능 요청으로 판단해 임의로 추가하지 않았다(제7장 제1조).
- OG/Twitter 카드 메타 태그도 같은 이유로 추가하지 않았다 — 필요하면 별도
  요청 부탁드린다.
- `push-send-batch.mjs`의 VAPID `mailto:no-reply@example.com`은 도메인
  전환과 무관한(라우팅 가능한 URL이 아니라 VAPID 스펙이 요구하는 형식적
  연락처 값) 별개 항목이라 손대지 않았다.
- 메타데이터의 `title`("local-open-spaces")/`description`은 여전히 초기
  플레이스홀더 문구다 — 이번 지시는 도메인/URL 문제만 다뤄 브랜딩 문구 자체는
  건드리지 않았다(임의 UI/콘텐츠 변경 금지).

## 검증
- `npx tsc --noEmit` / `npm run test`(190개 파일 2207개, 회귀 없음) /
  `npm run build` 모두 통과.

## 외부 작업 필요(코드 범위 밖, 사용자 몫)
- Vercel 프로젝트 설정에서 `nadri-pick.com` 커스텀 도메인 추가.
- 도메인 등록기관에서 DNS 레코드 설정.
- Vercel 프로덕션 환경변수에 `NEXT_PUBLIC_SITE_URL=https://nadri-pick.com` 등록.
- (선택, 이미 문서화된 별도 작업) 클라우드플레어 Email Routing을 실제로 쓸
  경우 `inbound.nadri-pick.com` 같은 서브도메인 라우팅 설정 — 이건 이번
  도메인 전환과 무관하게 이미 이전 웹훅 구현 기록에서 "외부 작업 필요"로
  안내된 항목이다.
