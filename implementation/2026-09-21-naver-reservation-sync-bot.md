# [개선사항 2 재개] 네이버 예약 스태프 계정 동기화 봇

## 배경 — 왜 스킵했다가 다시 진행했나
직전에 [개선사항 2]를 스킵했던 이유는 (1) 제안된 `reservations` 테이블이
이미 존재하는 다른 스키마의 `reservations`(스팟 방문 예약 신청)와 이름이
충돌하고, (2) 웹훅 기반 인프라(naver-booking/email-inbound)와 아키텍처가
상충한다는 것이었다. 사용자가 이어서 명확히 확인:
- "기존 reservations 테이블 기준으로 하면 되지.. 중요한건 그 프로세스" —
  테이블 네이밍 자체는 문제가 아니라는 뜻으로 판단해, 이미 이 정확한 목적
  (파트너별 네이버 예약, `source='naver'`)으로 설계돼 있던 `bookings`에
  필요한 컬럼만 추가하는 쪽으로 정리했다(새 테이블을 또 만들지 않음).
- "웹훅은 계속 봤는데 더이상 웹훅할 수 있는게 없음.. 현재 유일하게 네이버
  예약 정보 가져올 수 있는 방법은 (1) 스태프 계정 위임 + 봇 (2) 크롬 확장
  프로그램(비현실적)" — 웹훅 인프라(이미 구현됨)와 이 봇이 경쟁하는 게
  아니라, 웹훅이 현실적으로 막다른 길임을 확인한 뒤 스태프 계정 스크래핑이
  유일하게 남은 실제 경로임을 확정한 것이다.

## 변경 사항

### DB (`scripts/migrations/2026-09-21-naver-reservation-sync-columns.sql`)
- `partners.naver_bizes_id text`(nullable) — 네이버 예약 파트너센터 업체
  식별자. 스태프 권한 위임이 끝난 파트너만 값이 채워진다. 지금은 온보딩
  폼이 아니라 운영팀이 직접 DB에 기록한다(온보딩 UI 확장은 범위 밖).
- `bookings.naver_reservation_id text` + 부분 유니크 인덱스(null 제외) —
  "예약 번호를 기준으로 Upsert" 요구사항의 멱등키. 나드리픽 직접 등록/기존
  웹훅 건에는 없어도 되므로 nullable + 부분 인덱스.
- `bookings.updated_at timestamptz`(신규, 기존엔 `created_at`만 있었음) —
  봇이 재스크래핑할 때마다 갱신해 "마지막 동기화 시각"을 추적할 수 있게.

### 상태 매핑 (`scripts/partner/naver-reservation-status.mjs`, 신규)
네이버 예약 파트너센터 화면의 한국어 상태 라벨(확정/취소/노쇼/완료 등 흔히
쓰이는 후보)을 `bookings.status`로 매핑. 어떤 후보에도 안 걸리면 `null`을
반환해(추측하지 않음) 호출부가 명시적으로 처리하게 한다.

### 봇 본체 (`scripts/partner/naver-reservation-sync-bot.mjs`, 신규)
`node scripts/partner/naver-reservation-sync-bot.mjs [--debug]`로 실행.
1. `NAVER_STAFF_SESSION_COOKIES_JSON`(Playwright `addCookies()` 형식의
   JSON 배열)을 파싱 — 없거나 형식이 틀리면 즉시 명확한 에러로 중단.
2. `naver_bizes_id`가 채워진 파트너 전부를 Supabase에서 조회.
3. Playwright(headless Chromium)로 세션 쿠키를 주입한 브라우저 컨텍스트를
   띄우고, 파트너마다 예약 목록 페이지로 이동.
4. `bookings`에 `naver_reservation_id`를 멱등키로 upsert(`source='naver'`,
   알 수 없는 상태는 `'confirmed'`로 안전 폴백 + 경고 로그).
5. 처리 건수/실패 건수 요약 로그.

## ⚠️ 정직한 한계 고지 — 실제 페이지 구조를 확인하지 못했다
이 세션에는 네이버 예약 파트너센터 스태프 계정도, 그 화면의 실제 HTML도
없어(권한 위임을 실제로 받아야만 접근 가능) 예약 목록 페이지의 진짜 구조를
한 번도 보지 못했다. 그래서:
- **완성된 부분(실제로 동작함)**: 세션 주입, 업체 순회, Supabase upsert(멱등키
  포함), 상태 매핑, 로깅/에러 처리 — 사용자가 "중요한 건 프로세스"라고 확정한
  부분 전체.
- **미완성 부분**: `extractReservationsFromPage()`(실제 페이지에서 예약자명/
  연락처/날짜/시간/인원/예약번호를 뽑아내는 함수)는 항상 빈 배열을 반환하며
  콘솔에 명확한 경고를 남긴다. 이메일 정규식 파서(직전 작업)와 달리, CSS
  셀렉터는 "흔히 쓰이는 패턴" 같은 게 없어 추측이 사실상 불가능하고, 틀린
  셀렉터는 "0건 추출"로 조용히 실패해 문제를 숨긴다 — 그래서 추측 코드를
  넣지 않았다(제3장 제5조 추측 금지, 이메일 파서보다 훨씬 엄격하게 적용).
- **다음 단계를 위한 장치**: `--debug` 플래그(또는 `DEBUG_NAVER_SCRAPE=true`)로
  실행하면 각 업체의 실제 페이지 HTML과 스크린샷을 `scripts/partner/.debug/`에
  저장한다 — 실제 스태프 계정 접근이 가능해지면 이 결과물을 나에게 공유해
  주면 `extractReservationsFromPage()`를 실제 구조에 맞춰 완성할 수 있다.
- `NAVER_PARTNER_CENTER_BASE_URL`/`NAVER_PARTNER_CENTER_LIST_PATH`도 실제
  값을 확인하지 못해 일반적으로 알려진 형태를 기본값으로만 넣어뒀다 — env로
  즉시 덮어쓸 수 있어 실제 URL이 다르더라도 코드 수정 없이 바로잡을 수 있다.

## 검증
- `npx tsc --noEmit`(이 파일들은 순수 `.mjs`라 Next.js 타입체크 대상은
  아니지만, 나머지 앱 코드에 영향 없음을 확인) / `npm run test`(192개 파일
  2224개, 신규 17개 — 상태 매핑 9개, 봇의 세션 쿠키 검증/upsert 로직 8개) /
  `npm run build` 모두 통과.
- 실측: `node scripts/partner/naver-reservation-sync-bot.mjs`를 쿠키 env
  없이 직접 실행해 의도한 에러 메시지로 안전하게 즉시 종료함을 확인.

## 다음 단계(사용자 몫)
1. 실제 파트너 1곳에 대해 스태프 권한 위임을 완료하고, 그 계정으로 로그인한
   브라우저의 세션 쿠키를 내보내 `NAVER_STAFF_SESSION_COOKIES_JSON`에 설정.
2. 그 파트너의 `partners.naver_bizes_id`를 DB에 기록(현재는 수동).
3. `--debug`로 한 번 실행해 저장된 HTML/스크린샷을 공유 — 그 결과로
   `extractReservationsFromPage()`와 실제 BASE_URL/LIST_PATH를 완성.
4. 완성 후 cron(GitHub Actions 등 이 프로젝트의 기존 배치 스케줄 관례)에
   등록해 주기적으로 실행.
