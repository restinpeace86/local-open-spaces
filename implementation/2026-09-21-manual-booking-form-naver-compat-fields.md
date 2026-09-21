# [네이버 예약 호환 수동 예약 등록 폼]

## 구현 대상
사용자 요청(2026-09-21): 파트너가 직접 예약을 생성/관리할 수 있는 수동 예약
등록 UI+기능, `source='manual'` 고정, 네이버 자동 수집 건(`source='naver'`)과
통합 관리 가능하도록 설계. 요구 필드: `product_name`/`customer_name`/
`customer_phone`(형식 검증)/`booking_date`/`head_count`/`total_price`/
`status`/`source`.

## 기존 기능과의 관계 — 새로 만들지 않고 확장함
조사 결과 이 요청이 설명하는 기능은 **2026-09-20에 이미 구현된 "수기 예약
등록"(`AddBookingFab`/`createBooking`)과 완전히 같은 기능**이었다(파트너
일간 뷰에서 FAB으로 직접 예약 등록, `bookings` 테이블에 저장, 네이버 건과
같은 테이블에서 통합 관리). 차이는 두 가지뿐이었다:
1. 이번 요청은 없던 필드 `product_name`/`total_price`를 요구.
2. 이번 요청은 source 값을 `'manual'`로 명시했는데, 기존 구현은 같은
   의미로 `'nadripik'`을 쓰고 있었다.

같은 개념에 두 벌의 폼/컬럼을 만들면 어느 쪽이 진짜인지 불분명해지고
유지보수 부담만 커지므로(제5장 제4조 기존 구조 우선), 새 폼을 만들지 않고
기존 기능에 필드를 추가 + source 값 이름을 이번 요청이 명시한 `'manual'`로
통일했다. 아직 이 기능이 나온 지 하루밖에 안 돼 실사용 데이터가 거의 없는
단계라 값 자체를 안전하게 마이그레이션할 수 있었다.

## 변경 사항

### DB (`scripts/migrations/2026-09-21-bookings-manual-fields-and-source-rename.sql`, 적용 완료)
- 기존 `source='nadripik'` 행을 `'manual'`로 일괄 변경 + 체크 제약을
  `check (source in ('naver', 'manual'))`로 교체.
- `product_name text`(nullable), `total_price integer`(nullable, `>= 0`
  체크) 컬럼 추가 — 다른 가격 컬럼(`deals.original_price` 등)과 동일하게
  KRW 정수(소수점 없음) 컨벤션을 따름. 둘 다 선택 입력(요구사항에 필수
  표시 없음, 전화로 대략 예약만 먼저 잡고 나중에 채우는 흐름도 자연스러움).
- `node scripts/apply-sql.mjs`로 적용 + `node scripts/gen-types.mjs`로
  `src/types/database.types.ts` 갱신 완료.

### `src/actions/partner/bookings.ts`
- `CreateBookingInput`에 `product_name`/`total_price` 추가.
- **연락처 형식 검증 신규 추가**(요구사항 "010-XXXX-XXXX 형식 검증"):
  `PHONE_FORMAT_REGEX = /^\d{2,3}-\d{3,4}-\d{4}$/` — 서울 02 등 2자리
  지역번호도 있어 010 고정이 아니라 일반적인 국내 전화번호 하이픈 형식으로
  검증한다(기존 `formatPhoneNumber` 주석과 동일하게 완전한 국번 규칙까지는
  다루지 않음 — 추측 금지).
- `total_price` 검증: 있으면 0 이상의 정수여야 함.
- insert 시 `source: 'manual'`(기존 `'nadripik'`에서 변경), `product_name`/
  `total_price` 포함.

### `src/components/partner/booking-card.tsx`
- `SOURCE_META`의 키를 `nadripik` → `manual`로 변경(라벨/색상은 "수기 등록"/
  파랑 계열로 그대로 유지 — 의미가 바뀐 게 아니라 이름만 정정).
- `product_name`(있으면 예약자명 아래) / `total_price`(있으면 원화
  콤마 포맷으로 전화번호 아래) 표시 추가.

### `src/components/partner/add-booking-fab.tsx`
- "상품명/객실명(선택)" 텍스트 입력, "결제 금액(선택)" 숫자 입력 추가(둘 다
  선택 입력이라 빈 값이면 `null`로 전송).

### `src/app/partner/(tabs)/today/page.tsx`
- `select`에 `product_name, total_price` 추가(그렇지 않으면 `BookingCard`가
  새로 요구하는 필드가 항상 `undefined`로 넘어감).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 193개 파일 2239개 통과(신규 7개 — 연락처 형식 오류/결제
  금액 검증/상품명·결제 금액 저장 액션 테스트 3개, BookingCard 상품명·금액
  표시/미표시 및 source 라벨 변경 테스트 3개, AddBookingFab 상품명·금액
  전달 테스트 1개; 기존 `nadripik` 관련 테스트는 `manual`로 갱신).
- `npm run build` 통과.
- 실제 화면 확인: 로컬 dev 서버 기동 후 미들웨어 가드가 정상 동작함(비로그인
  상태로 `/partner/today` 접근 시 `/partner/login`으로 리다이렉트)을
  확인했다. **다만 실제 폼 제출 end-to-end(로그인된 파트너 계정으로 상품명/
  결제 금액을 입력해 실제 DB에 저장되는지)까지는 확인하지 못했다** — 이
  세션에 로그인 가능한 실제 파트너 계정 자격 증명이 없다. 대신
  React Testing Library로 실제 DOM 입력/제출 흐름을 그대로 재현하는
  컴포넌트 테스트(위 신규 테스트)로 폼 동작을 검증했다.

## 특이 사항
- `source` 값을 `'nadripik'`→`'manual'`로 바꾸는 것은 사용자가 명시적으로
  요청한 값은 아니고, "같은 개념에 두 이름이 남는 것을 피하기 위한" 내 판단
  이다 — 되돌리기 쉬운 단순 이름 변경이라 진행했지만, 다른 의도(예: 향후
  `'nadripik'`과 `'manual'`을 실제로 구분되는 별개 채널로 쓸 계획이 있었던
  경우)가 있었다면 알려주시면 된다.
