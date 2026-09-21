# [HQ 전체 파트너 데이터 열람/삭제 권한 + 파트너 본인 예약 삭제]

## 구현 대상
사용자 지시(2026-09-22): "관리자에 대하여는 기존 데이터 다 보여야하고 삭제할
수 있는 권한도 있어야돼. 그리고 각 계정 파트너 사장님도 자기꺼는 앱에서
삭제할수 있어야하고." — 이전 세션에서 "본사 운영진 계정을 어떻게 식별할지
아직 정해지지 않아 추측 금지"로 의도적으로 미뤄뒀던 HQ 실 기능 구현을
이번에 재개했다.

## 사용자 결정
"HQ 계정을 어떻게 식별할까요?" 질문에 **이메일 화이트리스트(env var)**를
선택(별도 `hq_staff` 테이블 대안 대비 "코드 배포 없이 env만 바꿀 수 있고,
관리 UI가 필요 없을 만큼 소수 인원이라 가장 빠름").

## 변경 사항

### 1) HQ 역할 검증 (`src/lib/hq/is-hq-staff.ts`, 신규)
`HQ_STAFF_EMAILS`(콤마 구분, `.env.local`에 `goodguy10r@naver.com` 등록)를
매 호출마다 파싱해 이메일을 대소문자 무관 비교한다. **판별 불가(email
없음) 시 차단**을 기본값으로 뒀다 — 전체 고객 PII에 대한 권한이라, 이
프로젝트의 다른 곳(예: `province.ts`)이 콘텐츠 노출 판단 시 "판별 불가면
포함"을 기본값으로 쓰는 것과 반대 방향이 맞다(목적이 다르면 안전한 기본값의
방향도 다르다는 것을 이전 작업에서도 동일하게 적용한 원칙).

`src/middleware.ts`: `/hq/*` 가드에 이 검증을 추가했다 — **이전까지는
로그인만 하면 아무 계정이나(일반 파트너 사장님 본인 계정 포함) `/hq`에서
전체 고객 데이터를 볼 수 있었다**(실제 보안 공백). 화이트리스트에 없으면
`/hq/login?forbidden=1`로 리다이렉트하고, 그 화면에 "이 계정은 HQ 권한이
없어요" 안내를 추가했다(`auth_error=1` 관례와 동일한 쿼리 파라미터 패턴).

### 2) HQ 대시보드 (`src/app/hq/page.tsx`, 스텁 → 실제 구현)
서비스 롤 클라이언트(`createAdminClient`)로 전체 `partners`/`bookings`를
조회해 파트너별 섹션 + 표 형태로 렌더링. 각 행에 삭제 버튼
(`src/components/hq/hq-booking-row.tsx`, `window.confirm` 확인 후
`deleteBookingAsHq` 호출).

**빌드 중 실측으로 발견한 버그**: `npm run build` 결과 `/hq`만 유일하게
`○`(Static)로 프리렌더링되고 있었다(`/partner/today` 등은 세션 쿠키를 쓰는
`createClient()`가 자동으로 동적 렌더링을 유발해 `ƒ`(Dynamic))). 이 페이지는
서비스 롤 클라이언트만 써서 쿠키 접근이 없어 Next.js가 "요청별로 달라질 게
없다"고 오판, 빌드 시점 DB 스냅샷을 정적 HTML로 굳혀버렸다 — 배포 후 예약이
추가/삭제돼도 다음 배포 전까지 화면이 절대 안 바뀌는, HQ 대시보드의 목적과
정반대인 상태였다. `export const dynamic = 'force-dynamic'`를 추가해
수정하고, 빌드 결과에서 `ƒ /hq`로 바뀐 것을 재확인했다.

### 3) HQ 삭제 액션 (`src/actions/hq/bookings.ts`, 신규)
`deleteBookingAsHq(bookingId)`: 세션에서 `user.email`을 확인해
`isHqStaffEmail`을 **한 번 더** 검사한 뒤(미들웨어만 믿지 않는 defense in
depth — 이 액션은 유일하게 "소유자 검증"이 아니라 "전체 데이터 접근 권한
검증"이라 이중 확인의 가치가 크다고 판단) 서비스 롤 클라이언트로 삭제,
`/hq`를 revalidate.

### 4) 파트너 본인 예약 삭제 (`src/actions/partner/bookings.ts` +
`src/components/partner/booking-card.tsx`)
`deleteBooking(bookingId)`: `updateBookingStatus`와 동일하게 세션 기반
클라이언트 + RLS(`bookings_delete_own`, 2026-09-20 스키마에 이미 있던
정책 — 지금까지 실제로 쓰는 코드가 없었을 뿐)에 위임, 별도 소유권 검증
불필요. `BookingCard`에 "예약 삭제" 버튼 추가(`window.confirm` 확인,
성공 시 카드 즉시 숨김 + `router.refresh()`).

## 검증
- `npx tsc --noEmit` / `npm run test`(197개 파일 2266개, 신규 20개 —
  `is-hq-staff` 4개, HQ `deleteBookingAsHq` 4개, `HqBookingRow` 4개,
  파트너 `deleteBooking` 4개, `BookingCard` 삭제 버튼 3개, 기존 테스트
  수정분 포함) / `npm run build`(수정 후 `ƒ /hq` 확인) 모두 통과.
- **실제 브라우저 검증**(Playwright, 세션 쿠키 실주입 — 이전 세션에서
  확립한 방식과 동일): 
  1. HQ 화이트리스트 계정(임시 생성 후 검증 즉시 삭제)으로 `/hq` 접근 →
     A/B/C 3개 농장 전체(20건) 정상 표시, `console.error`/`pageerror`
     0건. 삭제 버튼 클릭 → 20건 → 19건으로 실제 감소 확인.
  2. 화이트리스트 밖 계정(기존 A농장 테스트 계정)으로 `/hq` 접근 →
     `/hq/login?forbidden=1`로 리다이렉트, "HQ 권한이 없어요" 안내 정상
     표시(다른 파트너 데이터가 전혀 안 보임 — 이전까지의 보안 공백이
     막혔음을 재확인).
  3. 파트너 계정(C농장)으로 `/partner/today`에서 "예약 삭제" 클릭 →
     카드 즉시 사라지고 실제 DB에서도 삭제됨(오늘 날짜 재조회 시 "예약된
     일정이 없어요").
  - 검증에 쓴 임시 HQ 계정/Playwright 스크립트/스크린샷은 모두 삭제했다.

## 특이 사항
- 이번 검증으로 A농장 테스트 예약이 10건→9건(HQ에서 1건 삭제) +
  9건→8건(별개로는 안 건드림), C농장이 3건→2건(파트너 본인이 1건 삭제)이
  됐다 — 남은 테스트 데이터는 사용자 요청대로 계속 보존한다.
- `.env.local`에 `HQ_STAFF_EMAILS=goodguy10r@naver.com` 추가(gitignore
  대상이라 커밋되지 않음) — **Vercel 프로덕션 환경변수에도 동일하게 등록
  해야 배포 환경에서 HQ 접근이 가능하다**(다른 env var들과 동일한 주의사항,
  사용자가 직접 해야 하는 외부 조치).
- `hq_staff` 테이블 방식이 아니라 env var를 선택했으므로, HQ 인원이 늘어날
  때마다 코드 재배포 없이 `HQ_STAFF_EMAILS` 값만 콤마로 추가하면 된다 —
  단 이 경우 Vercel 환경변수도 함께 갱신해야 한다.
