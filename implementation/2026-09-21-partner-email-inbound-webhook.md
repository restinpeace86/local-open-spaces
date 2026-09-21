# [나드리픽 파트너 PMS — 클라우드플레어 인바운드 메일 연동 웹훅]

## 구현 대상
사용자 지시(2026-09-21): 클라우드플레어 Email Routing/Worker가 포워딩하는
네이버 예약 알림 메일을 받아 `bookings`에 적재하는 웹훅(`/api/webhook/
email-inbound`) + 파트너별 고유 인바운드 토큰 발급.

## 정직한 한계 고지 — 실제 메일 샘플 없이 정규식을 설계함
이 세션에는 메일함 접근 권한이 없어 실제 "네이버 예약 알림" 메일 원문을 한 번도
보지 못했다. 이전 웹훅 작업(naver-booking, JSON 페이로드 계약을 새로 정의)과
같은 이유로, 이번에도 검증할 실제 외부 스펙이 없는 상태에서 파싱 로직을 짜야
했다 — 다만 이번엔 "임의의 JSON 필드명 정의"보다 훨씬 리스크가 큰 "실제 사람이
쓰는 한국어 메일 문구의 정규식 매칭"이라 더 신중하게 접근했다: 완전히 새로운
포맷을 확신 있게 하드코딩하는 대신, 한국 예약 알림 메일에서 흔히 쓰이는 라벨
표현 여러 개를 후보로 두고 순서대로 시도하는 유연한 파서로 만들었고, 한 항목
이라도 확신 있게 못 뽑으면 추측으로 채우지 않고 전체 실패(422) 처리한다. 실제
메일 샘플이 확보되면 라벨 후보 배열과 날짜/시간 정규식만 조정하면 되도록
구조를 짰다 — **사용자가 실제 메일 원문(개인정보 제거된) 1~2건을 공유해 주면
정확도를 크게 높일 수 있다.**

## 변경 사항

### DB — 파트너 고유 인바운드 토큰
`scripts/migrations/2026-09-21-partners-inbound-token.sql`: `partners`에
`inbound_token text unique not null default substr(replace(gen_random_uuid()::
text, '-', ''), 1, 12)` 추가 — "신규 파트너 온보딩 시 자동으로 고유 토큰
생성"을 요구사항이 명시한 두 방법 중 **DB Default**로 만족했다. 이 방식을
고른 이유: `submitPartnerOnboarding`(온보딩 서버 액션)의 upsert 페이로드에
`inbound_token`을 아예 포함시키지 않아도(실제로 손대지 않음) 최초 insert 시
자동 발급되고, 온보딩 폼을 다시 제출해도(수정) 이미 있는 토큰이 그대로
유지된다(페이로드에 없는 컬럼은 upsert가 건드리지 않음) — 이미 발급한 메일
포워딩 주소가 갑자기 바뀌는 사고를 원천 차단한다.

### 메일 본문 파싱 (`src/lib/partner/parse-naver-reservation-email.ts`, 신규)
라벨 기반 추출(예약자명/예약자/성함/이름, 연락처/전화번호/휴대폰, 예약일시
(날짜+시간 한 줄)/예약날짜/예약일/방문일, 예약시간/방문시간, 인원/방문인원/
인원수) + 날짜(YYYY-MM-DD, YYYY년 M월 D일, 연도 생략 시 오늘(KST) 연도 사용)
+ 시간(24시간 HH:MM, 오전/오후 H시 M분) + 인원(성인 N명/아동 N명처럼 나뉜
표기를 전부 합산) 정규화. 전화번호는 라벨 값에서 못 찾으면 본문 전체에서
010 패턴을 최후 수단으로 스캔(오탐 위험이 낮은 패턴이라 허용). 기존
`formatPhoneNumber`(수기 예약 등록에서 이미 검증됨)를 그대로 재사용해 최종
형식을 통일했다.

### HTML 본문 대응 (`src/lib/partner/strip-html.ts`, 신규)
메일이 `text` 파트 없이 `html`만 줄 경우 정규식 파싱 전에 일반 텍스트로 변환.
완전한 HTML 파서가 아니라 줄바꿈 태그→개행, 나머지 태그 제거, 흔한 엔티티
복원만 하는 최소 구현(이 용도에는 그 이상이 필요 없음).

### 웹훅 라우트 (`src/app/api/webhook/email-inbound/route.ts`, 신규)
naver-booking 웹훅과 동일한 계층 구조(제5장 제4조):
1. `Authorization: Bearer <EMAIL_INBOUND_WEBHOOK_SECRET>` 공유 시크릿 —
   "이 요청이 정말 우리 클라우드플레어 Worker에서 왔는지"를 확인하는 층.
   미설정 시 500으로 안전하게 실패(값이 비어 있다고 통과시키지 않음).
2. 페이로드에서 `token`(직접 오면 우선) 또는 `to`의 로컬파트(@ 앞)를
   `inbound_token`으로 취급 — "어느 파트너의 예약인지"를 구분하는 층(위
   공유 시크릿과는 다른 층위).
3. `text` 우선, 없으면 `html`을 `stripHtml`로 변환해 파싱 대상 문자열 확보.
4. `partners.inbound_token`으로 `partner_id` 역조회(없으면 404).
5. `parseNaverReservationEmail`로 파싱(실패 시 422, DB에 아무것도 안 씀).
6. `bookings.insert({ partner_id, ..., source: 'naver', status: 'confirmed' })`.
   페이로드 계약도 naver-booking 웹훅과 마찬가지로 이번에 새로 정의했다
   (클라우드플레어 Worker 스크립트 자체는 범위 밖):
   ```json
   { "to": "abc123def456@inbound.nadri-pick.com", "token"?: "abc123def456",
     "text"?: "...", "html"?: "..." }
   ```

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 190개 파일 2207개 테스트 전부 통과(신규 25개 — 파서 8개,
  stripHtml 4개, 라우트 13개: 시크릿 미설정/누락/오류, JSON 파싱 실패,
  token/to 필수 검증, text/html 필수 검증, to→토큰 추출, token 우선순위,
  파트너 미매칭/조회 실패, 파싱 실패 시 422+DB 미기록, 정상 저장(payload
  정확성), html-only 입력, insert 실패).
- `npm run build` 통과 — 두 웹훅 라우트 모두 `ƒ`(동적)로 정상 생성.
- 실측: `node scripts/apply-sql.mjs`로 마이그레이션 적용 후 `partners.
  inbound_token` 컬럼이 실제로 조회 가능함을 확인. dev 서버에 실제 POST
  요청을 보내 `EMAIL_INBOUND_WEBHOOK_SECRET` 미설정 시 정확히 500 "서버
  설정 오류로 요청을 처리할 수 없습니다."를 반환함을 확인(안전하게 실패).
  파서 자체는 실제 네이버 예약 알림 메일로 검증하지 못했다(위 "정직한 한계
  고지" 참고) — mock 기반 단위 테스트로 설계한 라벨/포맷 변형들이 코드
  레벨에서 정확히 동작함만 확인했다.

## 특이 사항 / 다음 단계
- **실제 사용을 위해 필요한 작업**(사용자 몫): (1) `.env.local`(및 배포
  환경)에 `EMAIL_INBOUND_WEBHOOK_SECRET` 값 설정. (2) 클라우드플레어 Email
  Routing에서 인바운드 도메인(예: inbound.nadri-pick.com)을 등록하고, 수신
  주소 패턴을 이 Worker로 라우팅하도록 설정. (3) Worker 스크립트가 위
  페이로드 계약 형태로 이 엔드포인트에 POST하도록 작성(이번 범위 밖).
- **정확도를 높이려면**: 실제 네이버 예약 알림 메일 원문(개인정보 제거)을
  1~2건 확보해 `parse-naver-reservation-email.ts`의 라벨 후보/정규식을
  실측 기반으로 교정하는 것을 강력히 권장한다 — 지금은 "흔히 쓰이는 표현"에
  대한 합리적 추정이지 검증된 실제 포맷이 아니다.
- 과거 데이터 이관(도어투도어 메일함 스캔) 및 미리보기 검수 화면(spec.md
  6절)은 여전히 이번 범위 밖 — 이 웹훅은 실시간 신규 확정 건만 다룬다.
