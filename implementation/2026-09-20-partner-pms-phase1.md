# [나드리픽 파트너 PMS & HQ 모듈 Phase 1]

## 구현 대상
사용자 지시(2026-09-20, `docs/partner_spec.md` 신규 작성): "나드리픽 파트너 스마트
장부(PMS) 및 플랫폼 관리자(HQ) 모듈의 핵심 뼈대를 구축하는 Phase 1 구현" — 아래
3개 영역만 우선 구현(일간/주간/월간 상세 뷰, 웹훅, 알림톡은 다음 단계):
1. Supabase DB 스키마 + RLS(멀티 테넌시).
2. `/partner/*`, (구 스펙 `/admin/*` → `/hq/*`) 라우팅 + 미들웨어 인증 가드.
3. 파트너 PMS 기본 레이아웃 + 하단 4탭 네비게이션 뼈대.

## 착수 전 확인한 충돌 — 사용자 결정 반영
조사 결과 `/admin/*`이 이미 이 프로젝트의 인증 없는 콘텐츠 큐레이션 관리자 화면
(`src/app/admin/data-grid`, `/pipeline`, `/reservations`)이 쓰고 있는 경로였다.
새 스펙의 "본사 운영진 전용 `/admin/*`"(완전히 다른 목적, 인증 필수)와 경로가
정면 충돌해 임의로 합치지 않고 확인했다 — **`/hq/*`로 분리**하기로 확정(사용자
선택). 기존 콘텐츠 큐레이션 관리자 화면은 이번 작업 범위 밖으로 그대로 둔다.

## 실사용 버그 발견 및 함께 수정 — `middleware.ts` 위치
새 파트너 라우트 가드를 dev 서버로 직접 확인하던 중(제5장 제8조 "실제 화면 동작
확인") 리다이렉트가 전혀 동작하지 않는 것을 발견했다. 원인: 이 프로젝트는
`src/app` 구조를 쓰는데 `middleware.ts`가 진짜 프로젝트 루트에 있었다 — Next.js는
`src/` 구조를 쓰는 프로젝트에서 미들웨어 파일이 `src/` 안에 있어야만 인식한다(밖에
두면 에러 없이 조용히 무시됨). 즉 **2026-09-02 도입된 Supabase 세션 갱신 로직도
지금까지 개발/운영 환경 모두에서 한 번도 실행된 적이 없었다**(dev 서버 실측:
`console.log`를 심어 확인 — 파일을 옮기기 전엔 한 번도 안 찍힘, 옮긴 뒤 정상 출력).
`middleware.ts` → `src/middleware.ts`로 옮기는 것만으로 이 파일 전체(기존 세션
갱신 + 이번에 추가한 파트너/HQ 가드)가 처음으로 정상 작동하게 됐다. (참고: Next.js
16이 "middleware" 파일 관례를 "proxy"로 이름 바꾸라는 경고를 띄우지만, 이번 작업
범위와 무관한 별개의 마이그레이션이라 이름은 그대로 두고 위치만 고쳤다.)

## 변경 사항

### 1) DB 스키마 + RLS
`scripts/migrations/2026-09-20-partner-pms-schema.sql`: `partners`(파트너
프로필, `id`가 `auth.users(id)`와 1:1) / `bookings`(통합 예약, `idx_bookings_
partner_date` 인덱스) / `partner_settings`(리마인드 템플릿) 3개 테이블, 전부
RLS 활성화 + `auth.uid() = id`(또는 `partner_id`) 기준 소유자 전용 정책. 스펙
문서 하단에 첨부된 상세 SQL 요구사항을 그대로 따랐고, 슈퍼어드민 RLS 예외
정책(spec.md 9절)은 "본사 운영진 계정을 어떻게 식별할지"가 아직 정해지지 않아
포함하지 않았다(추측 금지 — HQ 대시보드 기능을 실제로 붙이는 다음 단계에서
별도로 설계). 적용 후 `node scripts/gen-types.mjs`로 타입 재생성.

### 2) 미들웨어 인증 가드 (`src/middleware.ts`)
기존 세션 갱신 로직 뒤에 이어 붙였다(같은 supabase 클라이언트/쿠키 컨텍스트
재사용 — 리다이렉트 응답에도 갱신된 쿠키가 실리도록 `redirectPreservingCookies`
헬퍼로 명시적으로 복사).
- `/partner/*`(로그인/콜백 제외): 세션 없으면 `/partner/login`으로. 세션은
  있지만 `partners` 행이 없으면(신규 로그인, 아직 온보딩 전) `/partner/
  onboarding`으로(무한 리다이렉트 방지를 위해 onboarding 자신은 이 체크
  대상에서 제외).
- `/hq/*`(로그인 제외): 세션 없으면 `/hq/login`으로. 역할(진짜 본사 운영진인지)
  검증은 위와 같은 이유로 다음 단계로 미뤘다.

### 3) 인증 라우트
- `src/app/partner/login/page.tsx`, `src/app/hq/login/page.tsx`: 기존
  `KakaoLoginButton`/`GoogleLoginButton`(제5장 제4조 기존 구조 우선)에
  `callbackPath` prop을 새로 추가해(기본값 `/auth/callback`, 기존 동작 100%
  보존) 각각 `/partner/auth/callback`, `/hq/auth/callback`으로 보낸다.
- `src/app/partner/auth/callback/route.ts`, `src/app/hq/auth/callback/route.ts`:
  기존 `src/app/auth/callback/route.ts`(일반 유저, `profiles` 완성 여부 체크)와
  동일한 code-교환 패턴이지만 대상 테이블이 다르다 — 두 사용자층이 완전히
  분리된 테이블이라(`profiles` vs `partners`) 데이터가 섞이지 않는다(spec.md
  3절 "나드리픽의 로그인 유저와는 데이터가 섞이거나 오염되면 안 됨" 충족 —
  Supabase Auth `auth.users` 풀 자체는 공유하지만 그건 정상 동작이고, 요구사항의
  취지는 애플리케이션 데이터 테이블 분리).
- `src/app/partner/onboarding/page.tsx`: 미들웨어 리다이렉트 목적지 스텁(실제
  상호명/스팟 연동 폼은 다음 단계).

### 4) 파트너 하단 4탭 뼈대
- `src/components/partner/partner-bottom-tabs.tsx`(신규): 오늘/주간/월간/더보기.
- `src/app/partner/(tabs)/layout.tsx`: 탭바 레이아웃 — **route group**으로 둬서
  `/partner/login`, `/partner/onboarding`(형제 라우트)은 이 탭바를 상속하지
  않는다(로그인 전/온보딩 중 화면에 탭바가 보이면 안 됨).
- `src/app/partner/(tabs)/{today,weekly,monthly,more}/page.tsx`: 각 탭 스텁
  화면 — 실제 예약 데이터 연동은 다음 단계, 지금은 정직한 빈 상태 문구만 표시
  (가짜 데이터 없음). "더보기"만 예외로, 이미 검증된 공용 `SignOutButton`을
  재사용해 로그아웃이 실제로 동작한다.
- `src/app/partner/page.tsx`: `/partner` 진입 시 기본 홈(오늘)으로 리다이렉트.

### 5) 소비자 크롬(하단 탭/프로필 완성 가드) 격리
"기존 나드리픽 루트 코드베이스와 오염되지 않도록" 요구사항 — `src/app/layout.tsx`가
`<BottomTabs />`/`<ProfileCompletionGuard />`를 전역(모든 라우트) 마운트하고
있어(route group으로 전체 소비자 라우트를 옮기는 대규모 리팩터 대신) 두 컴포넌트가
**스스로 pathname을 보고 `/partner`, `/hq`에서는 렌더링을 건너뛰도록** 최소
변경으로 격리했다:
- `bottom-tabs.tsx`: 모든 훅 호출 뒤, 렌더링 전에 `pathname?.startsWith('/partner') || pathname?.startsWith('/hq')`이면 `null` 반환.
- `profile-completion-guard.tsx`: 기존 `EXEMPT_PATH_PREFIXES`(완성 화면 무한
  리다이렉트 방지용으로 이미 있던 패턴)에 `/partner`, `/hq` 추가 — 파트너/HQ는
  `profiles`(닉네임/자녀 출생년도)와 무관한 별도 사용자층이라 이 가드가
  개입하면 안 된다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 172개 파일 2067개 테스트 전부 통과(신규 5개 — 로그인 버튼
  `callbackPath` 파라미터 검증, `PartnerBottomTabs` 3개, `BottomTabs`/
  `ProfileCompletionGuard`가 `/partner`, `/hq`에서 개입하지 않는지 검증).
- `npm run build` 통과 — 빌드 라우트 목록에 `/partner/*`, `/hq/*` 전부 정상
  생성 확인.
- **실측(dev 서버 직접 기동 + curl)**: `/partner/today`(비로그인) → 307
  `/partner/login`, `/partner/onboarding`(비로그인) → 307 `/partner/login`,
  `/hq`(비로그인) → 307 `/hq/login`, `/partner/login`·`/hq/login` → 200(정상
  렌더, 카카오/구글 버튼 텍스트 확인), 기존 소비자 라우트(`/`, `/nearby`)와
  기존 관리자 라우트(`/admin/data-grid`)는 전과 동일하게 200 + 하단 탭 정상
  노출(회귀 없음 확인).

## 특이 사항 / 다음 단계
- 이번 Phase 1에서 다루지 않은 것(스펙 문서에 명시된 대로 의도적 보류):
  온보딩 폼(상호명/스팟 연동 입력) 실제 구현, 일간/주간/월간 실제 데이터
  조회·렌더링, 네이버 예약 웹훅, 카카오 알림톡 발송, HQ 역할 검증(superadmin
  bypass RLS 포함) 및 실제 대시보드 집계/임퍼소네이션.
- `middleware.ts` 위치 수정은 이번 작업의 부수 효과로 발견·수정한 것이지만
  영향 범위가 이 세션 전체(기존 세션 갱신 로직)에 걸쳐 있어 별도로 강조해
  기록한다 — 로그인 후 세션이 예상보다 일찍 끊기는 것처럼 보였던 과거 제보가
  있었다면 이 버그가 원인이었을 가능성이 있다(다만 이번 세션에서 그런 제보를
  직접 조사하지는 않았다 — 추측 금지).
