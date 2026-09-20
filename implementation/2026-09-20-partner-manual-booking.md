# [나드리픽 파트너 PMS — 수기 예약 등록]

## 구현 대상
사용자 지시(2026-09-20): 파트너가 전화/방문 예약을 직접 등록할 수 있는 기능을
일간 뷰(`/partner/today`)에 추가. FAB(+예약 추가) → 바텀시트 폼 → Server Action
INSERT → 성공 시 시트 닫힘 + 화면 즉시 새로고침.

## 변경 사항

### 전화번호 포맷터 (`src/lib/partner/format-phone.ts`, 신규)
"입력 시 하이픈 자동 포맷팅" 요구사항 — 이 코드베이스에 전례가 없어 새로 만듦.
숫자만 추출해 자릿수별로 3-4/3-3-4/3-4-4로 묶는다(완전한 전화번호 검증기가
아니라 입력 편의 도구 — 요구사항 원문도 "권장" 수준).

### Server Action 추가 (`src/actions/partner/bookings.ts`)
`createBooking(input)`: `customer_name`/`customer_phone`/`booking_date`
(`YYYY-MM-DD`)/`booking_time`(`HH:MM`)/`headcount`(정수 ≥1) 검증 → 로그인 확인
→ `bookings.insert({ partner_id: user.id, ..., source: 'nadripik', status:
'confirmed' })`(요구사항 원문대로 두 값 고정, `partner_id`는 클라이언트가 보낼
수 없도록 입력 타입 자체에서 제외) → 성공 시 `revalidatePath('/partner/today')`.
`updateBookingStatus`와 동일한 파일에 나란히 둬서 파트너 예약 관련 액션이 한
곳에 모이게 했다.

### FAB + 바텀시트 폼 (`src/components/partner/add-booking-fab.tsx`, 신규)
- 우측 하단 고정 FAB(하단 탭바와 겹치지 않도록 `bottom-20`).
- 클릭 시 바텀시트(배경 클릭으로 안 닫힘 — 입력 중인 내용을 실수로 잃지 않게,
  이 코드베이스의 다른 입력량 많은 폼 모달과 동일한 관례).
- 예약 날짜 기본값은 지금 보고 있는 일간 뷰의 날짜(`defaultDate` prop, 페이지가
  넘겨줌).
- 예약 시간은 30분 단위 드롭다운(요구사항의 두 대안 중 이쪽을 선택 — 네이티브
  time input은 브라우저마다 UI가 달라 일관성이 떨어짐).
- 방문 인원은 +/− 스테퍼(최소 1명, disabled 처리).
- 제출 성공: 폼 초기화 → 시트 닫힘 → 기존에 있던 `Toast` 컴포넌트(`src/
  components/map/toast.tsx`, 범용 프레젠테이션 컴포넌트라 그대로 재사용)로
  "예약이 등록됐어요." 안내 → `router.refresh()`(서버의 `revalidatePath`와 함께
  이중으로 확실하게 최신 데이터 반영, `BookingCard`의 상태 변경과 동일한 관례).
- 제출 실패: 폼 안 인라인 에러 + 같은 메시지의 토스트를 동시에 띄운다(요구사항 4
  "필수값 누락 시 폼 에러" + "INSERT 실패 시 토스트" 둘 다 만족 — 이 액션이 두
  실패 유형을 구분해 반환하지 않아 항상 둘 다 보여주는 쪽을 택함).

### 페이지 연결 (`src/app/partner/(tabs)/today/page.tsx`)
`<AddBookingFab defaultDate={date} />` 추가 — 현재 조회 중인 날짜를 그대로
전달한다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 180개 파일 2127개 테스트 전부 통과(신규 24개 — 전화번호
  포맷터 6개, `createBooking` 검증/로그인/insert/revalidate 9개, FAB/시트
  UI 7개(하이픈 자동 포맷, 인원 스테퍼 한계, 제출 payload, 성공/실패 처리)).
  기존 `updateBookingStatus` 테스트도 `insert` mock 추가에 맞춰 함께 갱신.
- `npm run build` 통과.
- 실측: admin 클라이언트로 존재하지 않는 `partner_id`를 넣어 직접 insert를
  시도해 `bookings_partner_id_fkey` 위반 에러가 정확히 발생함을 확인 —
  `createBooking`이 만드는 payload의 컬럼명/타입이 실제 스키마와 완전히
  일치함을 간접 확인했다(FK 위반 외의 다른 스키마 오류는 없었음).
- 실측 한계: 이번에도 실제 로그인 세션이 있어야 폼 제출이 가능해, 브라우저로
  실제 로그인한 파트너 계정으로 예약을 등록하고 카드가 나타나는 end-to-end는
  이 세션에서 직접 밟지 못했다 — 사용자가 다음으로 직접 브라우저에서 테스트할
  계획임을 밝혔으므로, 그 테스트 결과를 기다린다.

## 특이 사항
`Toast`가 원래 `src/components/map/` 아래 있던 지도 화면 전용처럼 보이는
위치의 컴포넌트지만 실제로는 `message` 문자열 하나만 받는 완전한 범용
프레젠테이션 컴포넌트라 그대로 가져다 썼다 — 파트너 전용 토스트를 새로 만들지
않음(제5장 제4조).
