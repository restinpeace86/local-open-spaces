# [나드리픽 파트너 PMS — 네이버 예약 인바운드 웹훅]

## 구현 대상
사용자 지시(2026-09-20): `POST /api/webhook/naver-booking` — 네이버 예약(또는
메일 파싱 릴레이)이 보내는 확정 예약 데이터를 수신해 해당 파트너의
`bookings`에 저장. 시크릿 토큰 검증, `spot_id`로 파트너 조회, `source='naver'`/
`status='confirmed'` 고정.

## 페이로드 계약을 새로 정의한 이유
네이버 예약은 임의의 제3자 URL로 웹훅을 직접 보내는 공식 기능이 없어(실제로
존재하는 외부 스펙을 확인할 방법이 없음), 이 라우트가 받을 JSON 형태는 이번에
새로 정의한 계약이다 — 별도의 메일 파싱 봇/릴레이 서비스가 이 형태로 변환해
보내는 것을 전제로 한다. 추측하지 않고, 이미 이 프로젝트의 `bookings` 컬럼명
및 `createBooking` 서버 액션(수기 예약 등록) 입력과 동일한 필드명
(`customer_name`/`customer_phone`/`booking_date`/`booking_time`/`headcount`/
`memo`)을 그대로 써서 일관성을 유지했고, 여기에 파트너 식별용 `spot_id`만
추가했다.

```json
{
  "spot_id": "open_spaces.id (uuid)",
  "customer_name": "홍길동",
  "customer_phone": "010-1234-5678",
  "booking_date": "2026-09-25",
  "booking_time": "14:30",
  "headcount": 4,
  "memo": "선택 항목"
}
```

## 변경 사항
`src/app/api/webhook/naver-booking/route.ts`(신규):
1. **인증**(요구사항 3): `Authorization: Bearer <NAVER_BOOKING_WEBHOOK_SECRET>`
   헤더 검증. 환경변수 자체가 설정 안 돼 있으면(로컬/스테이징에서 아직 실제
   시크릿을 안 꽂은 상태) 500으로 명확히 실패시킨다 — "시크릿이 비어 있으니
   통과"처럼 안전하지 않은 기본 동작을 두지 않는다. 이 라우트는 로그인 세션이
   없는 서버 대 서버 호출이라 세션 클라이언트가 아니라 `createAdminClient()`
   (service_role)로 DB에 접근한다.
2. **검증**(요구사항 2): `spot_id`/`customer_name`/`customer_phone`(공백
   불가), `booking_date`(`YYYY-MM-DD`), `booking_time`(`HH:MM` 또는
   `HH:MM:SS`), `headcount`(1 이상 정수) — 어느 하나라도 실패하면 어떤 필드가
   문제인지 명시한 400을 즉시 반환하고 DB를 전혀 건드리지 않는다.
3. **멀티 테넌시**(요구사항 3): `partners.spot_id = <payload.spot_id>`로
   `partner_id`를 역조회한다(파트너 온보딩 때 이미 스팟을 연동해 뒀다는 전제 —
   Phase 1 온보딩 구현과 자연스럽게 연결됨). 매칭되는 파트너가 없으면 404.
4. **저장**: `bookings.insert({ partner_id, ..., source: 'naver', status:
   'confirmed' })`. `booking_time`이 `HH:MM`(5자)로 오면 `:00`을 붙여 정규화한다
   (DB의 `time` 컬럼과 맞춤 — `createBooking` 서버 액션과 동일한 처리).
5. **응답/로깅**(요구사항 4): 성공 시 `200 { success: true, booking_id }`.
   실패 시나리오별로 401/400/404/500을 구분해 반환하고, 각 실패 지점마다
   `console.error`로 원인을 남긴다(파트너 미매칭의 경우 어떤 `spot_id`였는지도
   함께 기록해 추후 디버깅 가능하게 함).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 187개 파일 2182개 테스트 전부 통과(신규 17개 — 시크릿 미설정/
  누락/오류 3개, JSON 파싱 실패 1개, 필드별 검증 7개, 파트너 미매칭/조회 실패
  2개, 정상 저장(payload 정확성 포함)/memo 없음/시간 정규화 3개, insert 실패 1개).
- `npm run build` 통과 — `/api/webhook/naver-booking`이 `ƒ`(동적)로 정상 생성.
- 실측: dev 서버에 실제 POST 요청을 보내 `NAVER_BOOKING_WEBHOOK_SECRET`이
  설정 안 된 상태에서 정확히 500과 "서버 설정 오류로 요청을 처리할 수 없습니다."
  를 반환함을 확인(안전하게 실패). 실제 시크릿 값은 아직 `.env.local`에
  없으므로(실제 벤더/릴레이 서비스가 아직 없어 값 자체가 존재하지 않음) 이
  세션에서 인증 통과 이후의 실제 성공 경로까지 라이브로 재현하지는 못했다 —
  대신 admin 클라이언트를 모킹한 단위 테스트로 그 경로(파트너 조회 → insert)를
  코드 레벨에서 완전히 검증했다.

## 특이 사항 / 다음 단계
- **실제 사용을 위해 필요한 작업**(사용자 몫): `.env.local`(및 배포 환경)에
  `NAVER_BOOKING_WEBHOOK_SECRET` 값을 직접 정하고, 그 값을 실제 메일 파싱
  봇/릴레이 서비스 쪽 설정에도 동일하게 넣어야 한다 — "실제 벤더 키만 꽂으면
  되는 구조"로 만들어 뒀다(이전 세션의 다른 외부 연동 작업과 동일한 원칙).
- 과거 데이터 이관(도어투도어, 메일함 스캔) 및 미리보기 검수 화면(spec.md 6절)
  은 이번 범위 밖 — 이 웹훅은 실시간 신규 확정 건만 다룬다.
