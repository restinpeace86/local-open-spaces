# 파트너 상품 시간 세팅 방식(자유/고정 회차) + 회차 예약 + 일간 타임라인

## 구현 대상
사용자 지시(2026-09-25): "/partner쪽의 상품을 설정하게 되어있는데 이게 네이버에선
뭔가 체험같은 것도 상품처럼 만드네 몇시꺼 해서 얼마 이런식으로? 인원도
고려해야겠고.. 지금 우리꺼는 시간은 딱히 없는데 시간은 고객이 정하는거라는것처럼
되어있는데 이게 아니고 체험 시간도 체험농장 사장님이 정하는거네" →
"아니 우리도 그럼 자유롭게 할수있도록 하되 상품에 대하여 시간도
세팅가능하게 하는건?" → "어 이 방식으로 구현들어가고 다만... 일자별
장부보는데선 오늘 건수들에 대하여 타임라인으로 보여지나?... 단순히 리스트로
보여지면 뭔가 매력이부족" → "어 그렇게 기존 기능안버리면서 한눈에 보는
느낌.. 사용자 경험을 최대한 편하게 좀 해줘".

`docs/partner_spec_v2_reservation_system.md` 3.1/4.3절에 이미 설계돼 있던
`product_sessions` 구조를 그대로 가져와, 상품마다 시간을 자유 입력(free)할지
사전 등록 회차(session) 중에서만 고를지 선택할 수 있게 했다. v2 스펙의
나머지 항목(연령 옵션, 입금 워크플로우, Solapi 알림톡, 정산 계좌, 공개
예약 랜딩페이지)은 이번 범위에 포함하지 않았다(별도로 논의/보류된 항목).

## 변경 사항

### DB
`scripts/migrations/2026-09-26-partner-product-sessions.sql` (적용 완료):
- `partner_products.time_mode text not null default 'free' check (in ('free','session'))`
- 신규 테이블 `product_sessions`(product_id/partner_id FK, session_date,
  start_time, end_time nullable, capacity check>0) + RLS(`auth.uid() = partner_id`,
  기존 partner_products/bookings와 동일 패턴)
- `bookings.session_id uuid references product_sessions(id) on delete set null`
- `npm run gen:types`로 `src/types/database.types.ts` 재생성.

### 서버 액션
- `src/lib/partner/time-mode.ts`(신규): `TIME_MODES`/`TimeMode` — pricing-unit.ts와
  동일한 이유로 'use server' 파일과 분리.
- `src/actions/partner/products.ts`: `PartnerProductInput`에 `time_mode` 추가,
  생성/수정 시 검증·저장.
- `src/actions/partner/sessions.ts`(신규): `createProductSession`/
  `updateProductSession`/`deleteProductSession`(회차 CRUD), `listProductSessions`
  (상품 관리 화면에서 전체 회차 + 예약 인원 합계 조회), `listAvailableSessionsForProduct`
  (예약 등록 폼에서 오늘 이후 회차 + 잔여 인원 조회). 잔여 인원은 별도 카운터
  컬럼 없이 조회 시점에 `capacity - sum(headcount, status != 'cancelled')`로
  계산한다(이 프로젝트의 기존 "집계는 조회 시점에 계산" 원칙과 동일).
- `src/actions/partner/bookings.ts`: `CreateBookingInput`에 `session_id`,
  `booking_date`/`booking_time`을 `string | null`로 변경. `createBooking`이
  `session_id`가 있으면 해당 회차의 `session_date`/`start_time`을 그대로
  `booking_date`/`booking_time`으로 채우고(BookingCard/today 리스트 코드는
  전혀 수정 불필요), 저장 직전에 서버에서 다시 정원을 검증한다(폼을 열어둔
  사이 다른 예약이 먼저 들어와 정원이 찼을 가능성 대응).

### UI
- `src/components/partner/products-manager.tsx`: 상품 등록/수정 폼에 "시간
  세팅 방식"(자유 시간/고정 회차) 라디오 추가. 고정 회차 상품은 목록에서
  "회차 관리" 버튼으로 회차 CRUD 패널(`product-sessions-manager.tsx`, 신규)을
  펼칠 수 있다.
- `src/components/partner/add-booking-fab.tsx`: 상품 선택 시 `time_mode`가
  `session`이면 자유 날짜/시간 입력 대신 그 상품의 회차 목록(잔여 인원 표시,
  마감 회차는 선택 불가)을 보여준다.
- `src/components/partner/daily-timeline-strip.tsx`(신규): `today/page.tsx`의
  기존 `BookingCard` 리스트는 그대로 두고, 그 위에 오늘 예약들을 시간순으로
  가로 스크롤 스트립으로 보여준다(점 탭 시 해당 카드로 스크롤 이동). docs/
  partner_spec.md 5절이 원래 의도했던 "시간대별 타임스케줄"을 리스트를
  대체하지 않는 방식으로 보완했다.

### 문서
`docs/partner_spec_v2_reservation_system.md` 4.3절에 이번에 구현한 범위와
뺀 부분(product_sessions.status 컬럼, age_breakdown 등)을 명시하는 각주 추가.

## 검증
- `npx tsc --noEmit` / `npm run test`(202개 파일 2,341개, 신규 테스트 다수
  포함) / `npm run build` 모두 통과.
- 개발 서버를 띄워 `/partner/today`, `/partner/more/products`가 500 없이
  응답하는지(둘 다 307 — 미들웨어의 로그인 리다이렉트, 정상) 확인. **다만
  실제 로그인 세션으로 회차 등록/선택/타임라인 탭 동작까지 브라우저에서
  직접 눌러보지는 못했다** — 이 세션에 인증된 파트너 계정으로 브라우저를
  띄울 수 있는 도구가 없었다. Review 단계에서 실제 화면 동작 확인이 필요하다.

## 특이 사항
- `product_sessions.status`(open/closed/cancelled)는 v2 스펙에 있었지만
  이번 구현에서는 뺐다 — 컬럼만 만들어두고 이를 다루는 관리 UI가 없으면
  죽은 컬럼이 되어 "확장을 위한 구조는 허용하되 확장 기능 자체를 구현하지
  않는다"는 취지(제5장 제7조)에도 맞지 않다고 판단했다. 필요해지면 별도로
  추가한다.
- 정원 초과 시 에러 메시지에 "잔여석"을 그대로 보여준다(`이 회차는 N자리만
  남아 있어요`) — 단순 실패 메시지보다 사장님이 바로 다음 행동(인원을
  줄이거나 다른 회차를 고르는 것)을 판단할 수 있게 하기 위함.
