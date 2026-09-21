# [실제 브라우저 UI 검증에서 발견한 크래시 수정 — BOOKING_STATUSES]

## 구현 대상
사용자 지적(2026-09-21): "아니 ui쪽까지 버그 없는지 확인해본거야? db에서
데이터레벨만 말고?" — 직전 작업(수기 예약 20건 테스트)에서 DB 쿼리 레벨
검증만 하고 실제 화면 렌더링은 확인하지 않았던 것을 정확히 지적받았다.

## 검증 방법 — 실제 브라우저로 재현
로그인 화면이 카카오/구글 OAuth만 지원해 자동화된 로그인이 불가능했지만,
Playwright(headless Chromium)로 다음과 같이 우회해 **실제 브라우저 런타임**을
그대로 재현했다:
1. 테스트 계정 3개(A/B/C농장) 각각에 대해 Supabase Admin API로 매직링크를
   생성하고, 그 응답에서 access_token/refresh_token을 추출한다.
2. `/partner/login`(인증 불필요한 공개 경로)을 열어, 그 페이지 컨텍스트
   안에서 이 프로젝트가 실제로 쓰는 것과 동일한 버전(`@supabase/ssr@0.12.4`,
   package.json에 고정된 버전)을 esm.sh로 그대로 로드해 `auth.setSession()`을
   호출 — 이 프로젝트의 실제 쿠키 저장 로직을 그대로 실행시켜, 추측 없이
   진짜와 동일한 세션 쿠키를 심었다.
3. 그 브라우저 컨텍스트로 `/partner/today`, `/partner/weekly`,
   `/partner/monthly`를 열어 `console.error`/`pageerror`(런타임 예외)를
   수집하고 스크린샷을 남기고, 다른 농장 고객명이 섞여 보이는지 텍스트로도
   검사했다.

## 발견한 버그
**`/partner/today`가 3개 계정 모두에서 예외 없이 항상 크래시**했다:
```
BOOKING_STATUSES.map is not a function
```
원인: `src/actions/partner/bookings.ts`가 `'use server'` 파일인데, 여기서
async 함수가 아닌 순수 값 `BOOKING_STATUSES`(상수 배열)를 `export`하고
있었다. Next.js는 `'use server'` 파일의 모든 export를 "클라이언트가 호출할
서버 액션"으로 취급해 참조로 치환하는데, 실제로는 배열이 아니라 서버
액션 참조 객체가 되어버려 `booking-card.tsx`의 `BOOKING_STATUSES.map(...)`
(상태 변경 버튼 4개를 렌더링하는 코드)이 그 자리에서 예외를 던졌다. 이
크래시로 예약 목록 전체가 화면에 안 보이는 상태였다(파트너의 기본 홈
화면이 사실상 항상 깨져 있었던 셈 — 이 버그는 2026-09-20 최초 구현 때부터
존재했고, 오늘 이전 작업들이 새로 만든 게 아니다).

**`tsc`/`vitest`가 못 잡은 이유**: `tsc`는 타입만 검사하고 이 런타임 값
치환은 타입 시스템에 드러나지 않는다. `vitest`는 Next.js의 서버 액션
번들러 변환을 전혀 거치지 않는 순수 Node 환경이라(그리고
`booking-card.test.tsx`는 `@/actions/partner/bookings`를 통째로 모킹해서
더더욱) 재현 자체가 불가능했다. **실제 브라우저(Turbopack이 빌드한 진짜
번들)로 열어봐야만 드러나는 버그**였다 — 사용자의 지적이 정확했다.

## 수정
`src/lib/partner/booking-status.ts`(신규, `'use server'`가 아닌 순수 모듈)로
`BOOKING_STATUSES`/`BookingStatus`를 분리했다:
- `src/actions/partner/bookings.ts`: 이 새 모듈에서 값을 **import**만 하고
  더 이상 export하지 않는다(내부 검증 로직에서만 사용). 이제 이 파일은
  async 함수(`updateBookingStatus`/`createBooking`)와 순수 타입만 export해
  'use server' 규칙을 지킨다.
- `src/components/partner/booking-card.tsx`: `BOOKING_STATUSES`/
  `BookingStatus`를 `@/actions/partner/bookings` 대신
  `@/lib/partner/booking-status`에서 직접 import하도록 변경.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 194개 파일 2247개 전부 통과(회귀 없음 — 기존 테스트가
  `@/actions/partner/bookings`를 모킹해 이 버그를 애초에 재현 못 했던
  것과 동일한 이유로, 수정 후에도 모킹 경로는 그대로 통과).
- `npm run build` 통과.
- **실제 화면 재확인(수정 후 동일한 Playwright 스크립트 재실행)**: A/B/C
  3개 계정 모두 `/partner/today`/`/weekly`/`/monthly`에서 `console.error`/
  `pageerror` 0건, 크래시 없이 정상 렌더링 확인. 스크린샷으로 실제 예약
  카드(뱃지/상품명/전화/금액/메모/상태 버튼)와 주간 리스트, 월간 캘린더가
  올바르게 표시됨을 육안으로도 확인했다. 다른 농장 고객명이 섞여 보이는
  경우도 없었다(격리 재확인).
- 검증에 쓴 Playwright 스크립트/스크린샷은 임시 산출물이라 확인 후 삭제
  했다(이 세션의 기존 관례와 동일).

## 특이 사항
- 이 버그는 오늘 작업이 만든 게 아니라 2026-09-20 최초 구현 때부터 있었던
  기존 버그다 — 사용자가 "UI쪽 검증했냐"고 재차 확인하지 않았다면 계속
  발견되지 않았을 가능성이 크다. `'use server'` 파일에 순수 값(상수/객체
  등 비-함수)을 절대 export하지 않는다는 규칙을 이후 다른 액션 파일
  작업에도 동일하게 적용해야 한다(`src/actions/partner/onboarding.ts` 등
  기존 액션 파일들은 이번에 함께 점검한 결과 값 export가 없어 안전함을
  확인했다).
